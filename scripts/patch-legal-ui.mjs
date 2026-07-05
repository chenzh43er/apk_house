import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const regions = ['us', 'de', 'de-ch-at'];

const mains = {
  aboutus: (active) => buildMain('About Us', 'An independent guide to affordable housing programs, waiting lists, and rental resources.', active, `
    <section class="legal-section">
      <p>Identity Insight (<a href="https://identityinsight.org/">identityinsight.org</a>) is an independent information platform that helps individuals and families discover affordable and low-income housing opportunities. We publish free, regularly updated resources about housing programs — including Section 8 vouchers, public housing, LIHTC properties, and regional waiting lists — for the United States, Germany, Switzerland, and Austria.</p>
      <p>Our mission is to make housing assistance information clear, accessible, and easy to navigate. Identity Insight is not a government agency, housing authority, property manager, or rental application service. We do not process applications, guarantee placement, or collect rent on behalf of any property.</p>
      <p>Visit <a href="https://identityinsight.org/">identityinsight.org</a> to browse region-specific guides and stay informed about housing opportunities in your area.</p>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">Contact Us</h2>
      <p>If you have questions about our content or need further information, please reach out.</p>
      <a class="legal-contact-email" href="mailto:support@identityinsight.org">support@identityinsight.org</a>
    </section>`),

  disclaimer: (active) => buildMain('Disclaimer', 'Important information about how you should use the content on this website.', active, `
    <section class="legal-section">
      <p>Identity Insight (<a href="https://identityinsight.org/">identityinsight.org</a>) publishes content about affordable housing, low-income rental programs, and related topics for general informational purposes only. Nothing on this website constitutes legal, financial, or professional advice. While we strive for accuracy, we cannot guarantee the completeness, timeliness, or reliability of any information presented.</p>
      <p>We do not endorse, verify, or recommend any listed property, landlord, or housing program. Any actions you take based on information found on this site are solely at your own risk.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">No Affiliation</h2>
      <p>Identity Insight is not affiliated with, endorsed by, or acting on behalf of any government agency, housing authority, landlord, or property management company. Program names, eligibility rules, and availability are determined by the relevant authorities and may change without notice.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Limitation of Liability</h2>
      <p>To the fullest extent permitted by law, Identity Insight and its operators shall not be liable for any direct, indirect, incidental, or consequential losses or damages resulting from your use of this website or reliance on its content, including errors, omissions, or outdated information. You use this website at your own risk and should verify all cost, eligibility, and availability details with official sources or trusted providers before making decisions.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Disclaimer of Warranty</h2>
      <p>All information on identityinsight.org is provided "as is," and "as available," without warranties of any kind, whether express or implied, including but not limited to accuracy, completeness, currentness, or fitness for a particular purpose. Housing availability and program terms can change at any time.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Third-Party Content and Links</h2>
      <p>Our site may contain links to external third-party websites or display content sourced from third parties. We do not control, endorse, or assume responsibility for the content, accuracy, privacy practices, or security of those sites. Accessing third-party links is at your own risk, and we are not liable for any issues arising from your use of them.</p>
    </section>`),

  dcma: (active) => buildMain('DMCA', 'Copyright infringement notification policy and takedown procedures for identityinsight.org.', active, `
    <section class="legal-section">
      <p>If you believe that material available on identityinsight.org or its regional sub-sites infringes your copyright, please notify us by submitting a valid Digital Millennium Copyright Act ("DMCA") notice. Upon receipt of a complete and valid notice, we will remove or disable access to the allegedly infringing material and take appropriate follow-up action.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Our DMCA Policy</h2>
      <p>Identity Insight has adopted and implemented a policy for addressing claims of copyright infringement and, in appropriate circumstances as determined by us in our sole discretion, for terminating access of users who are repeat infringers. We reserve the right to remove, edit, or disable any content on the website that allegedly infringes another party's copyright, and to suspend or restrict access to the service when necessary.</p>
      <p>We are under no obligation to proactively scan content for third-party rights violations; however, we respect the copyright interests of others and do not knowingly permit infringing materials to remain on the website once we become aware of them.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Required Notice Information</h2>
      <p>If you believe any materials on identityinsight.org infringe a copyright, your written notice must include at a minimum:</p>
      <ul>
        <li>a physical or electronic signature of the copyright owner or their authorized representative;</li>
        <li>a description of the copyrighted work or other intellectual property that you claim has been infringed;</li>
        <li>a description of where the material that you claim is infringing is located on the site (include the full URL);</li>
        <li>your address, telephone number, and email address;</li>
        <li>a statement that you have a good-faith belief that the disputed use is not authorized by the copyright owner, its agent, or the law;</li>
        <li>a statement, under penalty of perjury, that the information in your notice is accurate and that you are authorized to act on behalf of the copyright owner.</li>
      </ul>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">Contact for DMCA Claims</h2>
      <p>Send copyright or intellectual property infringement notices to:</p>
      <a class="legal-contact-email" href="mailto:support@identityinsight.org">support@identityinsight.org</a>
    </section>`),

  privacy: (active) => buildMain('Privacy Policy', 'How Identity Insight collects, uses, stores, and protects your information when you use identityinsight.org.', active, `
    <section class="legal-section">
      <p><strong>Last updated:</strong> July 2025</p>
      <p>This Privacy Policy describes how Identity Insight (<a href="https://identityinsight.org/">identityinsight.org</a>) handles information when you visit our website. By using our site, you agree to the practices described below.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">What data do we collect?</h2>
      <p>We may collect information about which pages you visit, how long you stay on them, and how often you view them. This helps us understand how our website is used and improve our content. We may also store preferences such as favorites and search settings in your browser's local storage.</p>
      <p>We do not operate a user account or login system and do not intentionally collect sensitive personal information such as Social Security numbers, financial account details, or government ID numbers through this website.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How do we collect your data?</h2>
      <p>We collect data when you:</p>
      <ul>
        <li>use or view our website, including through cookies and similar technologies;</li>
        <li>save favorites or preferences, which are stored locally in your browser.</li>
      </ul>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How will we use your data?</h2>
      <p>We use this information to understand website usage, measure the popularity of different sections, improve our content and services, deliver and measure advertisements, and detect abuse when it occurs.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How do we store your data?</h2>
      <p>Favorites and search preferences are stored directly in your browser using local storage. Analytics and advertising partners may process data according to their own policies. We retain aggregated analytics data only as long as needed for the purposes described above.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Third-party services (analytics and advertising)</h2>
      <p>We use Google Tag Manager and Google advertising services (including Google Ad Manager and/or Google AdSense) to analyze traffic and display ads. These third parties may collect information such as your IP address, browser type, pages visited, and interactions with ads through cookies and similar technologies. For more information, see Google's privacy policy at <a href="https://policies.google.com/privacy">policies.google.com/privacy</a> and ad settings at <a href="https://adssettings.google.com">adssettings.google.com</a>.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">What are your rights?</h2>
      <p>Depending on your location, you may have the following data protection rights:</p>
      <ul>
        <li><strong>Right of access</strong> — You can ask whether we hold personal data about you and request a copy.</li>
        <li><strong>Right to correction</strong> — You can ask us to correct inaccurate or incomplete information.</li>
        <li><strong>Right to deletion</strong> — You can request deletion of your personal data in certain situations.</li>
        <li><strong>Right to restrict processing</strong> — You can ask us to limit how we process your data in certain situations.</li>
        <li><strong>Right to object</strong> — You can object to our processing of your personal data in certain situations.</li>
        <li><strong>Right to data portability</strong> — You can request transfer of your data to another organization or to you, under certain conditions.</li>
      </ul>
      <p>Residents of the European Economic Area, the United Kingdom, California, and other jurisdictions may have additional rights under applicable law. To exercise any of these rights, contact us at the email below.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Children's privacy</h2>
      <p>Identity Insight is not directed at children under 13 (or the applicable age of consent in your jurisdiction). We do not knowingly collect personal information from children. If you believe a child has provided us with personal data, please contact us and we will take steps to delete it.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How do we use cookies?</h2>
      <p>Identity Insight uses cookies to:</p>
      <ul>
        <li>remember your preferences and favorites;</li>
        <li>understand how you use our website;</li>
        <li>deliver and measure advertisements through our advertising partners.</li>
      </ul>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How to manage cookies</h2>
      <p>You can set your browser to refuse cookies. <a href="https://www.allaboutcookies.org">allaboutcookies.org</a> explains how to remove cookies from your browser. Some website features may not function properly if cookies are disabled.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Changes to this policy</h2>
      <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last updated" date. Continued use of the site after changes constitutes acceptance of the revised policy.</p>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">How to contact us</h2>
      <p>If you have questions about this Privacy Policy, the data we hold, or wish to exercise your data protection rights, contact us at:</p>
      <a class="legal-contact-email" href="mailto:support@identityinsight.org">support@identityinsight.org</a>
    </section>`),
};

function buildMain(title, lead, active, body) {
  const nav = (page, label) =>
    `<a href="${page}.html" class="legal-nav__link${active === page ? ' legal-nav__link--active' : ''}">${label}</a>`;
  return `<main class="legal-main">
  <header class="legal-hero">
    <span class="legal-hero__label">Legal Information</span>
    <h1 class="legal-hero__title">${title}</h1>
    <p class="legal-hero__lead">${lead}</p>
  </header>
  <nav class="legal-nav" aria-label="Legal pages">
    ${nav('aboutus', 'About Us')}
    ${nav('disclaimer', 'Disclaimer')}
    ${nav('dcma', 'DMCA')}
    ${nav('privacy', 'Privacy Policy')}
  </nav>
  <article class="legal-card archive">
    ${body}
  </article>
</main>`;
}

function patchCss(html) {
  html = html.replace(/<link[^>]*hs-style\.css[^>]*>\s*/g, '');
  html = html.replace(/<link[^>]*lch-office\.css[^>]*>\s*/g, '');
  if (!html.includes('layout-shell.css')) {
    html = html.replace(
      /(<meta name="viewport"[^>]*>)/i,
      '$1\n  <meta name="theme-color" content="#141b2e">\n  <link rel="stylesheet" href="/Public/Css/layout-shell.css">\n  <link rel="stylesheet" href="/Public/Css/legal-pages.css">'
    );
  }
  if (!html.includes('legal-pages.css')) {
    html = html.replace(
      /(<link rel="stylesheet" href="\.\/Public\/Css\/layout-shell\.css">)/,
      '$1\n  <link rel="stylesheet" href="./Public/Css/legal-pages.css">'
    );
  }
  return html;
}

for (const region of regions) {
  for (const page of ['aboutus', 'disclaimer', 'dcma', 'privacy']) {
    const file = join(root, region, `${page}.html`);
    let html = readFileSync(file, 'utf8');
    html = patchCss(html);
    if (!html.includes('class="page-legal"')) {
      html = html.replace('<body>', '<body class="page-legal">');
    }
    html = html.replace(/<main[\s\S]*?<\/main>/, mains[page](page));
    writeFileSync(file, html, 'utf8');
    console.log('patched', file);
  }
}
