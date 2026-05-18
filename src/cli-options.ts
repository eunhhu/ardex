import { usageError } from "./errors.ts";

export function parseOptions(args: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined || !arg.startsWith("-")) {
      continue;
    }
    const key = arg.startsWith("--") ? arg.slice(2) : arg.slice(1);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) {
      throw usageError(`Option ${arg} requires a value.`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

export function collectRepeatedOption(args: string[], optionName: string): string[] {
  const values: string[] = [];
  const flags = [`-${optionName}`, `--${optionName}`];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== undefined && flags.includes(arg)) {
      const value = args[index + 1];
      if (value !== undefined) {
        values.push(value);
      }
      index += 1;
    }
  }
  return values;
}

export function collectRepeatedLongOption(args: string[], optionName: string): string[] {
  const values: string[] = [];
  const flag = `--${optionName}`;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === flag) {
      const value = args[index + 1];
      if (value !== undefined && !value.startsWith("-")) {
        values.push(value);
      }
      index += 1;
    }
  }
  return values;
}
