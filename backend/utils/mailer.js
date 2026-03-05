import nodemailer from 'nodemailer';

const isDev = process.env.NODE_ENV !== 'production';

const transporter = nodemailer.createTransport(
  isDev
    ? {
        host: '127.0.0.1',
        port: 1025,
        secure: false,
        ignoreTLS: true,
      }
    : {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      }
);

export const sendEmail = async ({ to, subject, body }) => {
  const info = await transporter.sendMail({
    from: isDev ? 'noreply@localhost' : (process.env.SMTP_FROM || process.env.SMTP_USER),
    to,
    subject,
    text: body,
  });
  if (isDev) {
    console.log(`[Mailer DEV] Email enviado a ${to} — ver en http://localhost:8025`);
  }
  return info;
};

export default transporter;
