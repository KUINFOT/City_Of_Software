type PrintableReport = { title: string; bodyHtml: string };

export function escapePrintableText(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Opens a self-contained, print-optimised report. The browser print dialog
 * lets the vendor save it as PDF without relying on a server-side font (and
 * therefore preserves Thai content correctly on the user's own system).
 */
export function openPrintableReport({ title, bodyHtml }: PrintableReport): boolean {
  const reportWindow = window.open("", "_blank", "popup,width=1100,height=800");
  if (!reportWindow) return false;

  reportWindow.document.write(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>${escapePrintableText(title)}</title>
<style>
  * { box-sizing: border-box; } body { margin: 0; color: #17233b; font-family: "Noto Sans Thai", "Thonburi", Arial, sans-serif; font-size: 12px; line-height: 1.55; }
  main { max-width: 1120px; margin: 0 auto; padding: 38px; } h1 { margin: 0; font-size: 27px; } h2 { margin: 26px 0 9px; color: #244a84; font-size: 15px; } p { margin: 7px 0; }
  .meta, .notice { padding: 12px 14px; border-radius: 7px; } .meta { margin-top: 18px; color: #53647d; background: #f3f6fa; } .notice { margin-top: 24px; color: #5d4a19; background: #fff7dc; border: 1px solid #f1db8e; }
  table { width: 100%; margin-top: 12px; border-collapse: collapse; } th, td { padding: 10px; text-align: left; vertical-align: top; border: 1px solid #dce4ee; } th { color: #31425e; background: #f4f7fb; } ul { margin: 0; padding-left: 19px; } a { color: #164c98; overflow-wrap: anywhere; }
  footer { margin-top: 32px; padding-top: 12px; color: #75839a; border-top: 1px solid #dce4ee; font-size: 10px; }
  @media print { main { max-width: none; padding: 14mm; } h2 { break-after: avoid; } table { break-inside: avoid; } }
</style></head><body><main>${bodyHtml}<footer>City of Software · สร้างเอกสารเมื่อ ${escapePrintableText(new Date().toLocaleString("th-TH"))}</footer></main></body></html>`);
  reportWindow.document.close();
  reportWindow.focus();
  window.setTimeout(() => reportWindow.print(), 200);
  return true;
}
