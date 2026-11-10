// Where the OpenRouter key can live besides a file: the operating system's own
// credential store. `openrouter setup|status|remove` write, read, and delete it
// here; `loadConfiguration` reads it last, so a key set in the shell or written
// in a config file still wins.
//
// No dependency: each platform is driven through the tool it ships with --
// `security` on macOS, `secret-tool` (libsecret) on Linux, PowerShell over
// advapi32's Cred* functions on Windows. The key never travels in argv, which
// `ps` shows to every account on the machine: macOS gets it as a command on
// `security -i`'s stdin, Linux and Windows on the child's stdin.

import { spawnSync } from "node:child_process";

export const KEYCHAIN_SERVICE = "mirror-mind";
export const KEYCHAIN_ACCOUNT = "OPENROUTER_API_KEY";

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Set when the program could not be started (`ENOENT`: not installed). */
  error?: NodeJS.ErrnoException;
}

export type Run = (
  command: string,
  args: readonly string[],
  input?: string,
  env?: Record<string, string>,
) => RunResult;

export interface CredentialStore {
  /** The human name of the store, for messages: "macOS Keychain". */
  readonly label: string;
  /** The stored secret, or null when there is none. Throws when the store cannot be reached. */
  get(): string | null;
  /** Store the secret, replacing any earlier one. Throws when the store cannot be written. */
  set(secret: string): void;
  /** Delete the secret. True when one was there. Throws when the store cannot be reached. */
  delete(): boolean;
}

export class CredentialStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialStoreError";
  }
}

const defaultRun: Run = (command, args, input, env) => {
  const result = spawnSync(command, [...args], {
    encoding: "utf8",
    ...(env ? { env: { ...process.env, ...env } } : {}),
    ...(input !== undefined ? { input } : {}),
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error ? { error: result.error as NodeJS.ErrnoException } : {}),
  };
};

/** The store for this operating system, or null on a platform with none. */
export function osCredentialStore(
  platform: NodeJS.Platform = process.platform,
  run: Run = defaultRun,
): CredentialStore | null {
  if (platform === "darwin") return macStore(run);
  if (platform === "linux") return linuxStore(run);
  if (platform === "win32") return windowsStore(run);
  return null;
}

function missingTool(tool: string, hint: string): CredentialStoreError {
  return new CredentialStoreError(`${tool} is not installed. ${hint}`);
}

// --- macOS: Keychain, through `security` ---

const MAC_NOT_FOUND = 44; // errSecItemNotFound

function macStore(run: Run): CredentialStore {
  const tool = "security";
  const hint = "It ships with macOS; check that /usr/bin is on PATH.";
  const call = (args: readonly string[], input?: string): RunResult => {
    const result = run(tool, args, input);
    if (result.error?.code === "ENOENT") throw missingTool(tool, hint);
    return result;
  };
  return {
    label: "macOS Keychain",
    get() {
      const r = call([
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
      ]);
      if (r.status === 0) return r.stdout.replace(/\r?\n$/, "") || null;
      if (r.status === MAC_NOT_FOUND) return null;
      throw new CredentialStoreError(`security could not read the Keychain (exit ${r.status}).`);
    },
    set(secret) {
      // `security -i` reads commands from stdin, so the secret stays out of argv.
      const quoted = `"${secret.replace(/[\\"]/g, "\\$&")}"`;
      const line = `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${KEYCHAIN_ACCOUNT} -w ${quoted}\n`;
      const r = call(["-i"], line);
      // `security -i` exits 0 even when its command failed; it says so on stderr.
      if (r.status !== 0 || /\bsecurity:|SecKeychain|error/i.test(r.stderr)) {
        throw new CredentialStoreError(`security could not write the Keychain (exit ${r.status}).`);
      }
    },
    delete() {
      const r = call(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT]);
      if (r.status === 0) return true;
      if (r.status === MAC_NOT_FOUND) return false;
      throw new CredentialStoreError(
        `security could not delete from the Keychain (exit ${r.status}).`,
      );
    },
  };
}

// --- Linux: Secret Service (GNOME Keyring, KWallet), through `secret-tool` ---

function linuxStore(run: Run): CredentialStore {
  const tool = "secret-tool";
  const hint =
    "Install libsecret's tool (Debian/Ubuntu: libsecret-tools, Fedora: libsecret) and run a keyring such as GNOME Keyring or KWallet.";
  const attrs = ["service", KEYCHAIN_SERVICE, "account", KEYCHAIN_ACCOUNT];
  const call = (args: readonly string[], input?: string): RunResult => {
    const result = run(tool, args, input);
    if (result.error?.code === "ENOENT") throw missingTool(tool, hint);
    return result;
  };
  return {
    label: "the system keyring (Secret Service)",
    get() {
      const r = call(["lookup", ...attrs]);
      // `lookup` exits 1 with no output for "not found", and also for "no keyring
      // running"; the stderr text is what tells them apart.
      if (r.status === 0) return r.stdout.replace(/\r?\n$/, "") || null;
      if (r.status === 1 && r.stderr.trim() === "") return null;
      throw new CredentialStoreError(`secret-tool could not read the keyring: ${r.stderr.trim()}`);
    },
    set(secret) {
      const r = call(["store", "--label=Mirror Mind OpenRouter API key", ...attrs], secret);
      if (r.status !== 0) {
        throw new CredentialStoreError(
          `secret-tool could not write the keyring: ${r.stderr.trim()}`,
        );
      }
    },
    delete() {
      const existed = this.get() !== null;
      if (!existed) return false;
      const r = call(["clear", ...attrs]);
      if (r.status !== 0) {
        throw new CredentialStoreError(
          `secret-tool could not delete from the keyring: ${r.stderr.trim()}`,
        );
      }
      return true;
    },
  };
}

// --- Windows: Credential Manager, through PowerShell and advapi32 ---

const WIN_TARGET = `${KEYCHAIN_SERVICE}/${KEYCHAIN_ACCOUNT}`;
const WIN_NOT_FOUND = 3;

// The operation arrives in MIRROR_CRED_OP and the secret on stdin, so neither
// is in the command line. The script itself is passed as -EncodedCommand.
const WIN_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MirrorCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref CREDENTIAL c, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, uint type, uint flags, out IntPtr p);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredDelete(string target, uint type, uint flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  public static void Write(string target, string secret) {
    byte[] bytes = Encoding.Unicode.GetBytes(secret);
    IntPtr blob = Marshal.AllocHGlobal(bytes.Length);
    try {
      Marshal.Copy(bytes, 0, blob, bytes.Length);
      CREDENTIAL c = new CREDENTIAL();
      c.Type = 1; c.TargetName = target; c.UserName = "mirror";
      c.CredentialBlobSize = (uint)bytes.Length; c.CredentialBlob = blob; c.Persist = 2;
      if (!CredWrite(ref c, 0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    } finally { Marshal.FreeHGlobal(blob); }
  }
  public static string Read(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return null;
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      return Marshal.PtrToStringUni(c.CredentialBlob, (int)c.CredentialBlobSize / 2);
    } finally { CredFree(p); }
  }
  public static bool Delete(string target) { return CredDelete(target, 1, 0); }
}
'@
$target = '${WIN_TARGET}'
switch ($env:MIRROR_CRED_OP) {
  'get'    { $v = [MirrorCred]::Read($target); if ($null -eq $v) { exit ${WIN_NOT_FOUND} }; [Console]::Out.Write($v) }
  'set'    { [MirrorCred]::Write($target, [Console]::In.ReadToEnd()) }
  'delete' { if (-not [MirrorCred]::Delete($target)) { exit ${WIN_NOT_FOUND} } }
}
`;

function windowsStore(run: Run): CredentialStore {
  const encoded = Buffer.from(WIN_SCRIPT, "utf16le").toString("base64");
  const call = (op: "get" | "set" | "delete", input?: string): RunResult => {
    const result = run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      input,
      { MIRROR_CRED_OP: op },
    );
    if (result.error?.code === "ENOENT") {
      throw missingTool("powershell.exe", "It ships with Windows; check that it is on PATH.");
    }
    return result;
  };
  return {
    label: "Windows Credential Manager",
    get() {
      const r = call("get");
      if (r.status === 0) return r.stdout || null;
      if (r.status === WIN_NOT_FOUND) return null;
      throw new CredentialStoreError(
        `PowerShell could not read Credential Manager: ${r.stderr.trim()}`,
      );
    },
    set(secret) {
      const r = call("set", secret);
      if (r.status !== 0) {
        throw new CredentialStoreError(
          `PowerShell could not write Credential Manager: ${r.stderr.trim()}`,
        );
      }
    },
    delete() {
      const r = call("delete");
      if (r.status === 0) return true;
      if (r.status === WIN_NOT_FOUND) return false;
      throw new CredentialStoreError(
        `PowerShell could not delete from Credential Manager: ${r.stderr.trim()}`,
      );
    },
  };
}
