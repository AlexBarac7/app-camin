import nodemailer from 'nodemailer';

const subject = 'Invitația ta în aplicația Cămin';
const intro = 'Cererea ta de acces a fost aprobată. Activează-ți contul și alege o parolă. '
  + 'Apoi vei putea rezerva echipamente și trimite sesizări din aplicație.';
const expiry = 'Linkul este valabil 48 de ore și poate fi folosit o singură dată.';

export function createInvitationMailer({ from, ...smtp }) {
  const transport = nodemailer.createTransport({
    ...smtp, dnsTimeout: 5000, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000,
    disableFileAccess: true, disableUrlAccess: true, maxRecipients: 1,
  });
  return async (to, link) => {
    const { accepted } = await transport.sendMail({
      from: { name: 'Cămin', address: from },
      to: { address: to, name: '' },
      envelope: { from, to: [to] },
      subject,
      text: ['Bun venit!', intro, 'Activează contul: ' + link, expiry, 'Cu bine,\nCămin'].join('\n\n'),
      html: `<!doctype html><html lang="ro"><body style="margin:0;background:#eef5f1;color:#142b28;font:16px/1.55 Arial,sans-serif">
        <div style="max-width:520px;margin:24px auto;padding:28px;background:#ffffff;border-radius:16px">
          <p style="font-weight:bold;color:#0d4840">Cămin</p>
          <h1 style="margin:0 0 16px;font-size:28px">Bun venit!</h1>
          <p>${intro}</p>
          <p style="margin:24px 0"><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0d4840;color:#ffffff;font-weight:bold;text-decoration:none">Activează contul</a></p>
          <p>${expiry}</p>
          <p>Cu bine,<br>Cămin</p>
        </div>
      </body></html>`,
    });
    if (accepted.length !== 1) throw new Error('SMTP did not accept the invitation recipient.');
  };
}
