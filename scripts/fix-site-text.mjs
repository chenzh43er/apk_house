/**
 * Fix site-wide text for identityinsight.org rebrand:
 * - Replace UsLowCostHousing meta descriptions
 * - Remove old Footrel social links
 * - Update legal page content (EN + DE)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');

/** @param {string} dir */
function walkHtml(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walkHtml(p, files);
    } else if (name.endsWith('.html')) {
      files.push(p);
    }
  }
  return files;
}

const META_REPLACEMENTS = [
  [
    'content="UsLowCostHousing provides free and latest information about section 8 and low income housing resources, including waiting lists and local authorities."',
    'content="Identity Insight provides free, up-to-date information about Section 8 and low-income housing resources, including waiting lists and local housing authorities."',
  ],
  [
    'content="UsLowCostHousing offers you the easiest and fastest way to find Affordable Housing near you."',
    'content="Identity Insight helps you find affordable housing programs and rental resources near you."',
  ],
  [
    'content="UsLowCostHousing provides information on all lists of Affordable Housing in Alaska. Find the best one near you."',
    'content="Identity Insight provides affordable housing listings and resources in your area."',
  ],
  [
    'content="UsLowCostHousing provides 26 sources of Affordable Housing in Alaska, Anchorage near you."',
    'content="Identity Insight provides affordable housing listings and resources in your area."',
  ],
];

const FOOTREL_INSTAGRAM =
  /\s*<a href="https:\/\/www\.instagram\.com\/Footrel[^"]*"[\s\S]*?<\/a>/g;
const FOOTREL_YOUTUBE =
  /\s*<a href="https:\/\/www\.youtube\.com\/@Footrel"[\s\S]*?<\/a>/g;

const LEGAL_EN = {
  aboutus: {
    lead: 'An independent guide to affordable housing programs, waiting lists, and rental resources.',
    body: `
    <section class="legal-section">
      <p>Identity Insight (<a href="https://identityinsight.org/">identityinsight.org</a>) is an independent information platform that helps individuals and families discover affordable and low-income housing opportunities. We publish free, regularly updated resources about housing programs — including Section 8 vouchers, public housing, LIHTC properties, and regional waiting lists — for the United States, Germany, Switzerland, and Austria.</p>
      <p>Our mission is to make housing assistance information clear, accessible, and easy to navigate. Identity Insight is not a government agency, housing authority, property manager, or rental application service. We do not process applications, guarantee placement, or collect rent on behalf of any property.</p>
      <p>Visit <a href="https://identityinsight.org/">identityinsight.org</a> to browse region-specific guides and stay informed about housing opportunities in your area.</p>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">Contact Us</h2>
      <p>If you have questions about our content or need further information, please reach out.</p>
      <a class="legal-contact-email" href="mailto:support@identityinsight.org">support@identityinsight.org</a>
    </section>`,
  },
  disclaimer: {
    lead: 'Important information about how you should use the content on this website.',
    body: `
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
      <p>All information on identityinsight.org is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind, whether express or implied, including but not limited to accuracy, completeness, currentness, or fitness for a particular purpose. Housing availability and program terms can change at any time.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Third-Party Content and Links</h2>
      <p>Our site may contain links to external third-party websites or display content sourced from third parties. We do not control, endorse, or assume responsibility for the content, accuracy, privacy practices, or security of those sites. Accessing third-party links is at your own risk, and we are not liable for any issues arising from your use of them.</p>
    </section>`,
  },
  dcma: {
    lead: 'Copyright infringement notification policy and takedown procedures for identityinsight.org.',
    body: `
    <section class="legal-section">
      <p>If you believe that material available on identityinsight.org or its regional sub-sites infringes your copyright, please notify us by submitting a valid Digital Millennium Copyright Act (&ldquo;DMCA&rdquo;) notice. Upon receipt of a complete and valid notice, we will remove or disable access to the allegedly infringing material and take appropriate follow-up action.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Our DMCA Policy</h2>
      <p>Identity Insight has adopted and implemented a policy for addressing claims of copyright infringement and, in appropriate circumstances as determined by us in our sole discretion, for terminating access of users who are repeat infringers. We reserve the right to remove, edit, or disable any content on the website that allegedly infringes another party&rsquo;s copyright, and to suspend or restrict access to the service when necessary.</p>
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
    </section>`,
  },
  privacy: {
    lead: 'How Identity Insight collects, uses, stores, and protects your information when you use identityinsight.org.',
    body: `
    <section class="legal-section">
      <p><strong>Last updated:</strong> July 2025</p>
      <p>This Privacy Policy describes how Identity Insight (<a href="https://identityinsight.org/">identityinsight.org</a>) handles information when you visit our website. By using our site, you agree to the practices described below.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">What data do we collect?</h2>
      <p>We may collect information about which pages you visit, how long you stay on them, and how often you view them. This helps us understand how our website is used and improve our content. We may also store preferences such as favorites and search settings in your browser&rsquo;s local storage.</p>
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
      <p>We use Google Tag Manager and Google advertising services (including Google Ad Manager and/or Google AdSense) to analyze traffic and display ads. These third parties may collect information such as your IP address, browser type, pages visited, and interactions with ads through cookies and similar technologies. For more information, see Google&rsquo;s privacy policy at <a href="https://policies.google.com/privacy">policies.google.com/privacy</a> and ad settings at <a href="https://adssettings.google.com">adssettings.google.com</a>.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">What are your rights?</h2>
      <p>Depending on your location, you may have the following data protection rights:</p>
      <ul>
        <li><strong>Right of access</strong> &mdash; You can ask whether we hold personal data about you and request a copy.</li>
        <li><strong>Right to correction</strong> &mdash; You can ask us to correct inaccurate or incomplete information.</li>
        <li><strong>Right to deletion</strong> &mdash; You can request deletion of your personal data in certain situations.</li>
        <li><strong>Right to restrict processing</strong> &mdash; You can ask us to limit how we process your data in certain situations.</li>
        <li><strong>Right to object</strong> &mdash; You can object to our processing of your personal data in certain situations.</li>
        <li><strong>Right to data portability</strong> &mdash; You can request transfer of your data to another organization or to you, under certain conditions.</li>
      </ul>
      <p>Residents of the European Economic Area, the United Kingdom, California, and other jurisdictions may have additional rights under applicable law. To exercise any of these rights, contact us at the email below.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Children&rsquo;s privacy</h2>
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
      <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated &ldquo;Last updated&rdquo; date. Continued use of the site after changes constitutes acceptance of the revised policy.</p>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">How to contact us</h2>
      <p>If you have questions about this Privacy Policy, the data we hold, or wish to exercise your data protection rights, contact us at:</p>
      <a class="legal-contact-email" href="mailto:support@identityinsight.org">support@identityinsight.org</a>
    </section>`,
  },
};

const LEGAL_DE = {
  aboutus: {
    lead: 'Ein unabhängiger Leitfaden zu bezahlbarem Wohnraum, Wartelisten und Mietressourcen.',
    body: `
    <section class="legal-section">
      <p>Identity Insight (<a href="https://identityinsight.org/">identityinsight.org</a>) ist eine unabhängige Informationsplattform, die Menschen beim Finden von bezahlbarem Wohnraum und Hilfsangeboten für Menschen mit geringem Einkommen unterstützt. Wir veröffentlichen kostenlose, regelmäßig aktualisierte Ressourcen zu Wohnprogrammen — einschließlich Section-8-Gutscheine, Sozialwohnungen, LIHTC-Immobilien und regionaler Wartelisten — für die USA, Deutschland, die Schweiz und Österreich.</p>
      <p>Unser Ziel ist es, Informationen zu Wohnhilfe verständlich, zugänglich und leicht navigierbar zu machen. Identity Insight ist keine Behörde, Wohnungsbehörde, Hausverwaltung oder Antragsdienst. Wir bearbeiten keine Anträge, garantieren keine Vergabe und erheben keinen Mietzins im Namen Dritter.</p>
      <p>Besuchen Sie <a href="https://identityinsight.org/">identityinsight.org</a>, um regionsspezifische Leitfäden zu durchsuchen und über Wohnmöglichkeiten in Ihrer Nähe informiert zu bleiben.</p>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">Kontakt</h2>
      <p>Bei Fragen zu unseren Inhalten oder für weitere Informationen können Sie uns gerne kontaktieren.</p>
      <a class="legal-contact-email" href="mailto:support@identityinsight.org">support@identityinsight.org</a>
    </section>`,
  },
  disclaimer: {
    lead: 'Wichtige Hinweise zur Nutzung der Inhalte auf dieser Website.',
    body: `
    <section class="legal-section">
      <p>Identity Insight (<a href="https://identityinsight.org/">identityinsight.org</a>) veröffentlicht Inhalte zu bezahlbarem Wohnraum, sozialen Wohnprogrammen und verwandten Themen ausschließlich zu Informationszwecken. Nichts auf dieser Website stellt Rechts-, Finanz- oder Fachberatung dar. Obwohl wir uns um Genauigkeit bemühen, können wir Vollständigkeit, Aktualität oder Zuverlässigkeit der dargestellten Informationen nicht garantieren.</p>
      <p>Wir empfehlen, prüfen oder befürworten keine gelisteten Objekte, Vermieter oder Wohnprogramme. Handlungen auf Basis unserer Informationen erfolgen auf eigenes Risiko.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Keine Verbindung zu Behörden</h2>
      <p>Identity Insight steht in keiner Verbindung zu Behörden, Wohnungsämtern, Vermietern oder Hausverwaltungen und handelt nicht in deren Namen. Programmnamen, Anspruchsvoraussetzungen und Verfügbarkeit werden von den zuständigen Stellen festgelegt und können sich jederzeit ändern.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Haftungsbeschränkung</h2>
      <p>Soweit gesetzlich zulässig, haften Identity Insight und seine Betreiber nicht für direkte, indirekte, beiläufige oder Folgeschäden aus der Nutzung dieser Website oder dem Vertrauen auf deren Inhalte, einschließlich Fehlern, Auslassungen oder veralteten Angaben. Kosten-, Anspruchs- und Verfügbarkeitsinformationen sollten vor Entscheidungen bei offiziellen Stellen oder vertrauenswürdigen Anbietern überprüft werden.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Gewährleistungsausschluss</h2>
      <p>Alle Informationen auf identityinsight.org werden „wie besehen" und „wie verfügbar" ohne ausdrückliche oder stillschweigende Garantien bereitgestellt, einschließlich Genauigkeit, Vollständigkeit, Aktualität oder Eignung für einen bestimmten Zweck. Wohnverfügbarkeit und Programmbedingungen können sich jederzeit ändern.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Inhalte und Links Dritter</h2>
      <p>Unsere Website kann Links zu externen Websites oder Inhalte Dritter enthalten. Wir kontrollieren, befürworten oder übernehmen keine Verantwortung für deren Inhalte, Richtigkeit, Datenschutzpraktiken oder Sicherheit. Die Nutzung externer Links erfolgt auf eigenes Risiko.</p>
    </section>`,
  },
  dcma: {
    lead: 'Richtlinie zu Urheberrechtsverletzungen und Takedown-Verfahren für identityinsight.org.',
    body: `
    <section class="legal-section">
      <p>Wenn Sie der Ansicht sind, dass auf identityinsight.org oder seinen regionalen Unterseiten verfügbares Material Ihr Urheberrecht verletzt, benachrichtigen Sie uns bitte mit einer gültigen Mitteilung gemäß dem Digital Millennium Copyright Act („DMCA"). Nach Eingang einer vollständigen und gültigen Mitteilung entfernen oder deaktivieren wir den betreffenden Inhalt und leiten geeignete Folgemaßnahmen ein.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Unsere DMCA-Richtlinie</h2>
      <p>Identity Insight hat eine Richtlinie zur Bearbeitung von Urheberrechtsansprüchen eingeführt und behält sich vor, bei wiederholten Verstößen den Zugang zu sperren. Wir können Inhalte entfernen, bearbeiten oder deaktivieren, die mutmaßlich Rechte Dritter verletzen, und den Zugang zum Dienst bei Bedarf einschränken.</p>
      <p>Wir sind nicht verpflichtet, Inhalte proaktiv auf Rechtsverletzungen zu prüfen; respektieren jedoch die Urheberrechte anderer und dulden keine bekannten Verletzungen auf der Website.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Erforderliche Angaben in der Mitteilung</h2>
      <p>Ihre schriftliche Mitteilung muss mindestens enthalten:</p>
      <ul>
        <li>eine physische oder elektronische Unterschrift des Urheberrechtsinhabers oder seines Bevollmächtigten;</li>
        <li>eine Beschreibung des urheberrechtlich geschützten Werks;</li>
        <li>eine Beschreibung, wo sich das beanstandete Material auf der Website befindet (vollständige URL);</li>
        <li>Ihre Adresse, Telefonnummer und E-Mail-Adresse;</li>
        <li>eine Erklärung in gutem Glauben, dass die Nutzung nicht autorisiert ist;</li>
        <li>eine eidesstattliche Erklärung über die Richtigkeit der Angaben und Ihre Berechtigung zum Handeln.</li>
      </ul>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">Kontakt für DMCA-Ansprüche</h2>
      <p>Urheberrechts- oder geistige-Eigentums-Mitteilungen senden Sie an:</p>
      <a class="legal-contact-email" href="mailto:support@identityinsight.org">support@identityinsight.org</a>
    </section>`,
  },
  privacy: {
    lead: 'Wie Identity Insight Informationen erfasst, nutzt, speichert und schützt, wenn Sie identityinsight.org verwenden.',
    body: `
    <section class="legal-section">
      <p><strong>Letzte Aktualisierung:</strong> Juli 2025</p>
      <p>Diese Datenschutzerklärung beschreibt, wie Identity Insight (<a href="https://identityinsight.org/">identityinsight.org</a>) mit Informationen umgeht, wenn Sie unsere Website besuchen. Durch die Nutzung unserer Website stimmen Sie den unten beschriebenen Praktiken zu.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Welche Daten erfassen wir?</h2>
      <p>Wir können Informationen darüber erfassen, welche Seiten Sie besuchen, wie lange Sie dort bleiben und wie oft Sie sie aufrufen. Zudem können Favoriten und Sucheinstellungen im lokalen Speicher Ihres Browsers gespeichert werden.</p>
      <p>Wir betreiben kein Benutzerkonto- oder Anmeldesystem und erfassen über diese Website nicht absichtlich sensible personenbezogene Daten wie Sozialversicherungsnummern oder Finanzkontodaten.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Wie erfassen wir Ihre Daten?</h2>
      <p>Wir erfassen Daten, wenn Sie:</p>
      <ul>
        <li>unsere Website nutzen oder ansehen, einschließlich über Cookies und ähnliche Technologien;</li>
        <li>Favoriten oder Einstellungen speichern, die lokal in Ihrem Browser abgelegt werden.</li>
      </ul>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Wie nutzen wir Ihre Daten?</h2>
      <p>Wir verwenden diese Informationen, um die Nutzung der Website zu verstehen, die Beliebtheit einzelner Bereiche zu messen, Inhalte und Dienste zu verbessern, Werbung auszuspielen und zu messen sowie Missbrauch zu erkennen.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Wie speichern wir Ihre Daten?</h2>
      <p>Favoriten und Sucheinstellungen werden direkt in Ihrem Browser im lokalen Speicher abgelegt. Analyse- und Werbepartner können Daten gemäß ihren eigenen Richtlinien verarbeiten.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Dienste Dritter (Analyse und Werbung)</h2>
      <p>Wir nutzen Google Tag Manager und Google-Werbedienste (einschließlich Google Ad Manager und/oder Google AdSense). Diese Drittanbieter können Informationen wie IP-Adresse, Browsertyp, besuchte Seiten und Anzeigeninteraktionen über Cookies erfassen. Weitere Informationen: <a href="https://policies.google.com/privacy">policies.google.com/privacy</a> und Anzeigeneinstellungen: <a href="https://adssettings.google.com">adssettings.google.com</a>.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Welche Rechte haben Sie?</h2>
      <p>Je nach Standort können Ihnen folgende Datenschutzrechte zustehen:</p>
      <ul>
        <li><strong>Auskunftsrecht</strong> &mdash; Sie können erfragen, ob wir personenbezogene Daten über Sie speichern.</li>
        <li><strong>Berichtigungsrecht</strong> &mdash; Sie können die Korrektur unrichtiger Daten verlangen.</li>
        <li><strong>Löschungsrecht</strong> &mdash; Sie können die Löschung Ihrer Daten in bestimmten Fällen verlangen.</li>
        <li><strong>Recht auf Einschränkung</strong> &mdash; Sie können die Einschränkung der Verarbeitung verlangen.</li>
        <li><strong>Widerspruchsrecht</strong> &mdash; Sie können der Verarbeitung in bestimmten Fällen widersprechen.</li>
        <li><strong>Recht auf Datenübertragbarkeit</strong> &mdash; Sie können die Übertragung Ihrer Daten verlangen.</li>
      </ul>
      <p>Bewohner des EWR, des Vereinigten Königreichs, Kaliforniens und anderer Rechtsordnungen können zusätzliche Rechte haben. Kontaktieren Sie uns unter der unten genannten E-Mail-Adresse.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Datenschutz für Kinder</h2>
      <p>Identity Insight richtet sich nicht an Kinder unter 13 Jahren (oder dem geltenden Einwilligungsalter). Wir erfassen wissentlich keine personenbezogenen Daten von Kindern. Wenn Sie glauben, dass ein Kind uns Daten übermittelt hat, kontaktieren Sie uns bitte.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Wie verwenden wir Cookies?</h2>
      <p>Identity Insight verwendet Cookies, um:</p>
      <ul>
        <li>Ihre Präferenzen und Favoriten zu speichern;</li>
        <li>zu verstehen, wie Sie unsere Website nutzen;</li>
        <li>Werbung über unsere Partner auszuspielen und zu messen.</li>
      </ul>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Cookies verwalten</h2>
      <p>Sie können Ihren Browser so einstellen, dass Cookies abgelehnt werden. <a href="https://www.allaboutcookies.org">allaboutcookies.org</a> erklärt, wie Sie Cookies entfernen. Einige Funktionen funktionieren ohne Cookies möglicherweise nicht richtig.</p>
    </section>
    <section class="legal-section">
      <h2 class="legal-section__title">Änderungen dieser Richtlinie</h2>
      <p>Wir können diese Datenschutzerklärung von Zeit zu Zeit aktualisieren. Änderungen werden auf dieser Seite mit einem aktualisierten Datum veröffentlicht.</p>
    </section>
    <section class="legal-section legal-section--contact">
      <h2 class="legal-section__title">Kontakt</h2>
      <p>Bei Fragen zu dieser Datenschutzerklärung oder zur Ausübung Ihrer Rechte kontaktieren Sie uns unter:</p>
      <a class="legal-contact-email" href="mailto:support@identityinsight.org">support@identityinsight.org</a>
    </section>`,
  },
};

/** @param {string} page @param {string} lead @param {string} body */
function patchLegalMain(html, page, lead, body) {
  const leadRe = new RegExp(
    `(<h1 class="legal-hero__title">[^<]+</h1>\\s*<p class="legal-hero__lead">)[^<]+(</p>)`
  );
  html = html.replace(leadRe, `$1${lead}$2`);
  html = html.replace(
    /(<article class="legal-card archive">)[\s\S]*?(<\/article>)/,
    `$1\n    ${body.trim()}\n  $2`
  );
  return html;
}

/** @param {string} file */
function patchLegalFile(file) {
  const rel = file.slice(root.length + 1).replace(/\\/g, '/');
  const m = rel.match(/^(?:(us|de|de-ch-at)\/)?(aboutus|disclaimer|dcma|privacy)\.html$/);
  if (!m) return false;

  const [, region, page] = m;
  const isDe = region === 'de' || region === 'de-ch-at';
  const content = isDe ? LEGAL_DE[page] : LEGAL_EN[page];
  if (!content) return false;

  let html = readFileSync(file, 'utf8');
  html = patchLegalMain(html, page, content.lead, content.body);
  html = html.replace(
    /&copy; <span id="year">\d+<\/span> Identity Insight\./g,
    '&copy; <span id="year">2025</span> identityinsight.org.'
  );
  writeFileSync(file, html, 'utf8');
  console.log('legal:', rel);
  return true;
}

// --- Run ---
let htmlFiles = walkHtml(root);
let metaCount = 0;
let footrelCount = 0;

for (const file of htmlFiles) {
  let html = readFileSync(file, 'utf8');
  let changed = false;

  for (const [from, to] of META_REPLACEMENTS) {
    if (html.includes(from)) {
      html = html.replace(from, to);
      changed = true;
      metaCount++;
    }
  }

  if (FOOTREL_INSTAGRAM.test(html)) {
    html = html.replace(FOOTREL_INSTAGRAM, '');
    changed = true;
    footrelCount++;
  }
  if (FOOTREL_YOUTUBE.test(html)) {
    html = html.replace(FOOTREL_YOUTUBE, '');
    changed = true;
    footrelCount++;
  }

  // Standardize copyright on legal pages
  if (file.match(/(aboutus|disclaimer|dcma|privacy)\.html$/)) {
    const before = html;
    html = html.replace(
      /&copy; <span id="year">\d+<\/span> Identity Insight\. (All Rights Reserved\.|Alle Rechte vorbehalten\.)/g,
      (match, suffix) => `&copy; <span id="year">2025</span> identityinsight.org. ${suffix}`
    );
    if (html !== before) changed = true;
  }

  if (changed) writeFileSync(file, html, 'utf8');
}

for (const file of htmlFiles) {
  patchLegalFile(file);
}

// Fix localize-de-ui.mjs source string
const localizePath = join(root, 'scripts', 'localize-de-ui.mjs');
let localize = readFileSync(localizePath, 'utf8');
const oldMeta =
  'content="UsLowCostHousing provides free and latest information about section 8 and low income housing resources, including waiting lists and local authorities."';
const newMeta =
  'content="Identity Insight provides free, up-to-date information about Section 8 and low-income housing resources, including waiting lists and local housing authorities."';
if (localize.includes(oldMeta)) {
  localize = localize.replace(oldMeta, newMeta);
  writeFileSync(localizePath, localize, 'utf8');
  console.log('updated localize-de-ui.mjs');
}

console.log(`Done. Meta replacements: ${metaCount}, Footrel removals: ${footrelCount}`);
