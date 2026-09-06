/** Joins class names and drops the falsy ones. The whole of `clsx` that this
 *  site uses, without the dependency. */
export const cn = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");
