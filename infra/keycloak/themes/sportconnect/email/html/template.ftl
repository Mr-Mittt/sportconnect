<#macro emailLayout>
<html lang="${locale.language}" dir="ltr">
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;">
    <tr><td style="padding:20px 28px;border-bottom:1px solid #e4e7eb;font-size:20px;font-weight:bold;color:#185fa5;">SportConnect</td></tr>
    <tr><td style="padding:24px 28px;font-size:15px;line-height:1.5;"><#nested></td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #e4e7eb;font-size:12px;color:#7b8794;">${msg("emailFooter")}</td></tr>
  </table>
</body>
</html>
</#macro>
