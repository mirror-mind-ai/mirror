// A declared command's exit code is the command's exit code, exactly as a
// legacy handler's return value is.
process.stdout.write("declared failure\n");
process.exit(3);
