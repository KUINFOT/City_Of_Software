import { env } from '../config/env';
import type { MatchReason } from '../matching/matchReasons';

export type StageNotificationType = 'comment_stage' | 'announcement_stage';

export interface StageEmailTor {
  _id: unknown;
  title: string;
  agencyName: string;
  budget?: { amountThb?: number | null } | null;
}

const STAGE_LABEL: Record<StageNotificationType, string> = {
  comment_stage: 'เข้าสู่ช่วงรับฟังความคิดเห็นสาธารณะ',
  announcement_stage: 'ประกาศอย่างเป็นทางการแล้ว',
};

function formatThb(amount: number): string {
  return `${new Intl.NumberFormat('th-TH').format(amount)} บาท`;
}

/** SCRUM-102: appended to every notification email, text and HTML alike. */
function unsubscribeFooter(unsubscribeUrl: string): { text: string; html: string } {
  return {
    text: `\n\n---\nยกเลิกรับอีเมลแจ้งเตือน: ${unsubscribeUrl}`,
    html: `<p style="color:#8290a4;font-size:11px;margin-top:24px;">หากไม่ต้องการรับอีเมลแจ้งเตือนอีกต่อไป <a href="${unsubscribeUrl}">ยกเลิกรับอีเมล</a> (บัญชีของคุณจะยังใช้งานได้ตามปกติ)</p>`,
  };
}

/** SCRUM-92: title, agency, budget, match reasons, and a link back to the record. */
export function renderStageNotificationEmail(
  tor: StageEmailTor,
  type: StageNotificationType,
  reasons: MatchReason[],
  unsubscribeUrl: string,
  options: { referencesEarlierAlert?: boolean } = {}
): { subject: string; text: string; html: string } {
  const url = `${env.appUrl}/tors/${String(tor._id)}`;
  const budgetLine = tor.budget?.amountThb != null ? formatThb(tor.budget.amountThb) : 'ไม่ระบุ';
  const reasonLines = reasons.map((r) => `- ${r.detail}`).join('\n');
  const reasonHtml = reasons.map((r) => `<li>${r.detail}</li>`).join('');

  // SCRUM-94: the announcement-stage alert references the earlier
  // comment-stage one when the vendor actually received one — otherwise
  // (direct-appointment procurement that skips straight to bidding_open)
  // this reads as a standalone announcement, not a broken follow-up.
  const followUpLine =
    type === 'announcement_stage' && options.referencesEarlierAlert
      ? 'โครงการนี้เคยแจ้งเตือนคุณไปแล้วในช่วงรับฟังความคิดเห็น และตอนนี้ได้ประกาศอย่างเป็นทางการแล้ว\n\n'
      : '';
  const followUpHtml =
    type === 'announcement_stage' && options.referencesEarlierAlert
      ? '<p>โครงการนี้เคยแจ้งเตือนคุณไปแล้วในช่วงรับฟังความคิดเห็น และตอนนี้ได้ประกาศอย่างเป็นทางการแล้ว</p>'
      : '';

  const footer = unsubscribeFooter(unsubscribeUrl);
  const subject = `[City of Software] ${tor.title} — ${STAGE_LABEL[type]}`;
  const text =
    `${tor.title}\nหน่วยงาน: ${tor.agencyName}\nงบประมาณโดยประมาณ: ${budgetLine}\n\n` +
    followUpLine +
    `เหตุผลที่ตรงกับโปรไฟล์ของคุณ:\n${reasonLines}\n\nดูรายละเอียด: ${url}` +
    footer.text;
  const html =
    `<p><strong>${tor.title}</strong></p><p>หน่วยงาน: ${tor.agencyName}<br/>งบประมาณโดยประมาณ: ${budgetLine}</p>` +
    followUpHtml +
    `<p>เหตุผลที่ตรงกับโปรไฟล์ของคุณ:</p><ul>${reasonHtml}</ul><p><a href="${url}">ดูรายละเอียด TOR</a></p>` +
    footer.html;

  return { subject, text, html };
}

export interface DigestItem {
  torId: unknown;
  torTitle: string;
  agencyName: string;
}

/** SCRUM-97: one consolidated email per daily-digest vendor. */
export function renderDigestEmail(items: DigestItem[], unsubscribeUrl: string): { subject: string; text: string; html: string } {
  const url = (torId: unknown) => `${env.appUrl}/tors/${String(torId)}`;
  const lines = items.map((i) => `- ${i.torTitle} (${i.agencyName}) — ${url(i.torId)}`).join('\n');
  const htmlItems = items
    .map((i) => `<li><strong>${i.torTitle}</strong> (${i.agencyName}) — <a href="${url(i.torId)}">ดูรายละเอียด</a></li>`)
    .join('');
  const footer = unsubscribeFooter(unsubscribeUrl);

  return {
    subject: `[City of Software] สรุปโครงการที่ตรงกับคุณวันนี้ (${items.length} รายการ)`,
    text: `สรุปโครงการที่ตรงกับโปรไฟล์ของคุณวันนี้:\n\n${lines}` + footer.text,
    html: `<p>สรุปโครงการที่ตรงกับโปรไฟล์ของคุณวันนี้:</p><ul>${htmlItems}</ul>` + footer.html,
  };
}
