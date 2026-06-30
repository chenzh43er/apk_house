import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const regions = ['us', 'de', 'de-ch-at'];

const mains = {
  aboutus: (active) => buildMain('About Us', 'Affordable housing information and resources to help you find suitable rentals in your region.', active, `
    <section class="legal-section">
      <p>Apkintelligence.com is a website dedicated to providing up-to-date information on affordable and low-income housing. We offer free news about waiting lists, housing authorities, and rental resources to help you find suitable affordable housing.</p>
      <p>Visit <a href="https://apkintelligence.com/">apkintelligence.com</a> to stay informed about housing opportunities in your region.</p>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">Contact Us</h2>
      <p>Please feel free to contact us if you need any further information.</p>
      <a class="legal-contact-email" href="mailto:support@apkintelligence.com">support@apkintelligence.com</a>
    </section>`),

  disclaimer: (active) => buildMain('Disclaimer', 'Important information about how you should use the content on this website.', active, `
    <section class="legal-section">
      <p>Apkintelligence.com provides information on low-income and Section 8 housing for informational purposes only. While we strive for accuracy, we cannot guarantee the information's completeness or reliability. We do not endorse, verify or recommend any listed housing; any actions you take based on our information are solely at your own risk.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Limitation of Liability</h2>
      <p>We are not liable for any losses or damages resulting from the use of our site content, including any errors or outdated information. You use our website at your own risk, and we recommend verifying any cost or eligibility information with official sources or trusted providers.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Disclaimer of Warranty</h2>
      <p>The information on affordable housing is provided "as is," without any guarantees of accuracy, completeness, currentness or suitability for your needs. It is important to review all details and independently verify information, as availability and specific terms can change.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Disclaimers on Content</h2>
      <p>Our site may link to external third-party websites; we are not responsible for the content, accuracy, or security they provide. We do not endorse or control these sites, and you must use them with caution. Relying on information sourced from third parties through our website is done at your own risk, and we are not liable for any resulting issues.</p>
    </section>`),

  dcma: (active) => buildMain('DMCA', 'Copyright infringement notification policy and takedown procedures.', active, `
    <section class="legal-section">
      <p>If you believe that material available on our sites infringes on your copyright(s), please notify us by providing a Digital Millennium Copyright Act ("DMCA") Notice. Upon receipt of a complete and valid notice, we will remove the material and take appropriate follow-up action.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Our DMCA Policy</h2>
      <p>Apkintelligence.com has adopted and implemented a policy for addressing claims of copyright infringement, and for the termination, in appropriate circumstances as determined by us in our sole discretion, of users who are infringers of copyright. Further, we reserve the right to terminate, discontinue, suspend and restrict the ability to visit and use the service or remove, edit, erase or disable any content on the website that allegedly infringes another person's copyright. It is our policy to terminate the access of repeat offenders.</p>
      <p>We are under no obligation to, and do not, scan content for violations of third party rights; however, we respect the copyright interests of others and it is our policy not to permit materials known by us to infringe another party's copyright to remain on the website or the service.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Required Notice Information</h2>
      <p>If you believe any materials on the website, applications, or services infringe a copyright, you should provide us with written notice that at a minimum contains:</p>
      <ul>
        <li>a physical or electronic signature of the copyright owner or their authorized representative;</li>
        <li>a description of the copyrighted work or other intellectual property that you claim has been infringed;</li>
        <li>a description of where the material that you claim is infringing is located on the site;</li>
        <li>your address, telephone number, and email address;</li>
        <li>a statement by you that you have a good-faith belief that the disputed use is not authorized by the copyright owner, its agent, or the law;</li>
        <li>a statement, under penalty of perjury, confirming your notice's accuracy and your authorization.</li>
      </ul>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">Contact for DMCA Claims</h2>
      <p>If there is a claim of copyright or other intellectual property infringement, please contact us at:</p>
      <a class="legal-contact-email" href="mailto:support@apkintelligence.com">support@apkintelligence.com</a>
    </section>`),

  privacy: (active) => buildMain('Privacy Policy', 'How we collect, use, store, and protect your information when you use our website.', active, `
    <section class="legal-section">
      <h2 class="legal-section__title">What data do we collect?</h2>
      <p>We may collect information about which pages you visit, how long you stay on them, and how often you view them. This helps us understand how our website is used. We may also store preferences such as favorites and search settings in your browser's local storage.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How do we collect your data?</h2>
      <p>We collect data when you:</p>
      <ul>
        <li>Use or view our website, including through cookies and similar technologies.</li>
        <li>Save favorites or preferences, which are stored locally in your browser.</li>
      </ul>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How will we use your data?</h2>
      <p>We use this information to understand how the website is being used, measure the popularity of different sections, improve our content and services, and detect abuse when it occurs.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How do we store your data?</h2>
      <p>Favorites and search preferences are stored directly in your browser using local storage, making it convenient for you to return to your preferred options later. We do not operate a user account or login system.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Third-party services (analytics and advertising)</h2>
      <p>We use Google Tag Manager and Google advertising services (including Google Ad Manager and/or Google AdSense) to analyze traffic and display ads. These third parties may collect information such as your IP address, browser type, pages visited, and interactions with ads through cookies and similar technologies. For more information, see Google's privacy policy at <a href="https://policies.google.com/privacy">policies.google.com/privacy</a> and ad settings at <a href="https://adssettings.google.com">adssettings.google.com</a>.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">What are your rights?</h2>
      <p>Depending on your location, you may have the following data protection rights:</p>
      <ul>
        <li>The right of access – You can ask us whether we hold personal data about you and request a copy.</li>
        <li>The right to correction – You can ask us to promptly correct any inaccuracies or incomplete information in your data.</li>
        <li>The right to deletion – You can request us to delete your personal data in certain situations.</li>
        <li>The right to restrict processing – You can ask us to limit the processing of your personal data in certain situations.</li>
        <li>The right to object to processing – You can object to us processing your personal data in certain situations.</li>
        <li>The right to data portability – You can request us to transfer your data to another organization or to you, under certain conditions.</li>
      </ul>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How do we use cookies?</h2>
      <p>Apkintelligence.com uses cookies in a range of ways to improve your experience on our website, including:</p>
      <ul>
        <li>Remembering your preferences and favorites.</li>
        <li>Understanding how you use our website.</li>
        <li>Delivering and measuring advertisements through our advertising partners.</li>
      </ul>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">How to manage cookies</h2>
      <p>You can set your browser not to accept cookies, and <a href="https://www.allaboutcookies.org">allaboutcookies.org</a> explains how to remove cookies from your browser. However, in some cases, certain website features may not function as a result.</p>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">How to contact us</h2>
      <p>If you have any questions about Apkintelligence.com's privacy policy, the data we hold on you, or you would like to exercise one of your data protection rights, please contact us at:</p>
      <a class="legal-contact-email" href="mailto:support@apkintelligence.com">support@apkintelligence.com</a>
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
      '$1\n  <meta name="theme-color" content="#141b2e">\n  <link rel="stylesheet" href="/Public/Css/layout-shell.css">
  <link rel="stylesheet" href="/Public/Css/legal-pages.css">'
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
