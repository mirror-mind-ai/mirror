// Argv arrives verbatim: the user's arguments are appended to the declared
// command unchanged, including flags, `--`, quotes, and non-ASCII.
const argv = process.argv.slice(2);
process.stdout.write(`argv[${argv.length}]: ${argv.join(" ")}\n`);
