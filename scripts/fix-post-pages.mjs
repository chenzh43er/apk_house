import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const getPostIdFn = `    function getPostIdAndPageFromUrl() {
      const url = new URL(window.location.href);
      const path = url.pathname;

      const regex = /^\\/(?:de|us|de-ch-at)\\/post\\/([^/]+)\\/(\\d+)\\/?$/i;
      const match = path.match(regex);

      if (match) {
        return {
          postId: decodeURIComponent(match[1]),
          page: parseInt(match[2], 10) || 1,
        };
      }

      const postId = url.searchParams.get('postid');
      const page = parseInt(url.searchParams.get('page'), 10);
      return {
        postId: postId || null,
        page: page || 1,
      };
    }`;

const loadScriptFn = `function setupBottomDivAdObserver() {
    const bottom_div = document.getElementById('bottom_div');
    if (!bottom_div || bottom_div.dataset.adObserved) {
      return;
    }
    bottom_div.dataset.adObserved = '1';
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadPost_adv2(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px',
    });
    observer.observe(bottom_div);
  }

function loadScript(src, callback) {
    if (typeof postTITLE !== 'undefined') {
      setupBottomDivAdObserver();
      if (callback) callback();
      return;
    }

    let script = document.querySelector('script[data-post-title-loader]');
    if (script) {
      script.addEventListener('load', () => {
        if (callback) callback();
      }, { once: true });
      setupBottomDivAdObserver();
      return;
    }

    script = document.createElement('script');
    script.src = src;
    script.type = 'text/javascript';
    script.async = true;
    script.dataset.postTitleLoader = '1';

    script.onload = function () {
      if (callback) callback();
    };

    script.onerror = function () {
      console.error(\`Failed to load \${src}\`);
    };

    document.head.appendChild(script);
    setupBottomDivAdObserver();
  }`;

const guardSnippet = `      let thisPost = postTITLE[postId]

      if (!thisPost) {
        document.getElementById("postPage").innerHTML = '<p>Article not found.</p>';
        return;
      }

      const size = Object.keys(thisPost).length; //`;

for (const rel of ['post.html', 'us/post.html', 'de/post.html', 'de-ch-at/post.html']) {
  const fp = path.join(root, rel);
  let content = fs.readFileSync(fp, 'utf8');

  content = content.replace(
    /    function getPostIdAndPageFromUrl\(\) \{[\s\S]*?page: page \|\| 1,\s*\};\s*\}/,
    getPostIdFn.trim()
  );

  content = content.replace(
    /<script src="\.\/Public\/Js\/jquery-3\.0\.0\.min\.js"><\/script>\s*\n\s*<script>\s*\n\s*function getLangFromPath\(\) \{[\s\S]*?\n\}\s*\n\s*let lang = getLangFromPath\(\)/,
    '<script src="./Public/Js/jquery-3.0.0.min.js"></script>\n\n<script>'
  );

  content = content.replace(
    /function loadScript\(src, callback\) \{[\s\S]*?observer\.observe\(bottom_div\);\s*\}\s*\}/,
    loadScriptFn
  );

  content = content.replace(
    /      let thisPost = postTITLE\[postId\]\s*\n\s*const size = Object\.keys\(thisPost\)\.length; \/\//,
    guardSnippet
  );

  fs.writeFileSync(fp, content);
  console.log('fixed', rel);
}
