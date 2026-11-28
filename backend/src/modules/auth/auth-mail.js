import nodemailer from 'nodemailer';

const appName = 'Căminul Meu';

const invitation = {
  subject: 'Invitația ta în aplicația ' + appName,
  heading: 'Bun venit!',
  intro: 'Cererea ta de acces a fost aprobată. Activează-ți contul și alege o parolă. '
    + 'Apoi vei putea rezerva echipamente și trimite sesizări din aplicație.',
  action: 'Activează contul',
  expiry: 'Linkul este valabil 48 de ore și poate fi folosit o singură dată.',
};

const passwordReset = {
  subject: 'Resetarea parolei în aplicația ' + appName,
  heading: 'Resetează parola',
  intro: 'Pentru a schimba parola contului tău Cămin, deschide linkul de mai jos.',
  action: 'Alege o parolă nouă',
  expiry: 'Linkul este valabil 30 de minute și poate fi folosit o singură dată.',
};

const accessRejection = {
  subject: 'Cererea ta de acces a fost respinsă · ' + appName,
  heading: 'Cerere de acces respinsă',
  intro: 'Cererea ta de acces în aplicația ' + appName + ' a fost respinsă.',
};

export function createAuthMailer({ from, ...smtp }) {
  const transport = nodemailer.createTransport({
    ...smtp, dnsTimeout: 5000, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000,
    disableFileAccess: true, disableUrlAccess: true, maxRecipients: 1,
  });
  async function send(to, { subject, heading, intro, action, expiry }, link) {
    const details = link ? [action + ': ' + link, expiry] : [];
    const introHtml = intro.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const actionHtml = link ? `
          <p style="margin:24px 0"><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0d4840;color:#ffffff;font-weight:bold;text-decoration:none">${action}</a></p>
          <p>${expiry}</p>` : '';
    const { accepted } = await transport.sendMail({
      from: { name: appName, address: from },
      to: { address: to, name: '' },
      envelope: { from, to: [to] },
      subject,
      text: [heading, intro, ...details, 'Cu bine,\n' + appName].join('\n\n'),
      html: `<!doctype html><html lang="ro"><body style="margin:0;background:#eef5f1;color:#142b28;font:16px/1.55 Arial,sans-serif">
        <div style="max-width:520px;margin:24px auto;padding:28px;background:#ffffff;border-radius:16px">
          <p style="font-weight:bold;color:#0d4840">${appName}</p>
          <h1 style="margin:0 0 16px;font-size:28px">${heading}</h1>
          <p>${introHtml}</p>${actionHtml}
          <p>Cu bine,<br>${appName}</p>
        </div>
      </body></html>`,
    });
    if (accepted.length !== 1) throw new Error('SMTP did not accept the recipient.');
  }
  return {
    sendInvitation: (to, link) => send(to, invitation, link),
    sendPasswordReset: (to, link) => send(to, passwordReset, link),
    sendAccessRejection: to => send(to, accessRejection),
    sendEndReminder: (to, message) => send(to, {
      subject: 'Utilizarea la spălătorie se încheie în curând · ' + appName,
      heading: 'Se apropie finalul rezervării',
      intro: message,
    }),
  };
}
