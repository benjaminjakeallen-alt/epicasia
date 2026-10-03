/** A yes/no question (the browser's own dialog). */
export function confirm(title: string, message: string): Promise<boolean> {
  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}
