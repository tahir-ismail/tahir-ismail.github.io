const header = document.querySelector('.site-header');
const sentinel = document.querySelector('.scroll-sentinel');
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');
const sections = document.querySelectorAll('main section[id]');
const reveals = document.querySelectorAll('.reveal');

function closeMenu() {
  navToggle.classList.remove('open');
  navLinks.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

navToggle.addEventListener('click', () => {
  const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.classList.toggle('open', !isOpen);
  navLinks.classList.toggle('open', !isOpen);
  navToggle.setAttribute('aria-expanded', String(!isOpen));
  document.body.style.overflow = isOpen ? '' : 'hidden';
});

navAnchors.forEach((anchor) => anchor.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navLinks.classList.contains('open')) closeMenu();
});

// Stagger sibling reveals (e.g. bento cells, project rows) so they cascade in rather than appearing at once.
reveals.forEach((element) => {
  const siblings = [...element.parentElement.children].filter((child) => child.classList.contains('reveal'));
  const index = siblings.indexOf(element);
  if (index > 0) element.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 70}ms`);
});

if ('IntersectionObserver' in window) {
  // Header gets its bottom border once the page has scrolled past the top sentinel.
  new IntersectionObserver(([entry]) => {
    header.classList.toggle('scrolled', !entry.isIntersecting);
  }).observe(sentinel);

  // Highlight the nav link for whichever section is crossing the middle of the viewport.
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navAnchors.forEach((anchor) => {
        anchor.classList.toggle('active', anchor.getAttribute('href') === `#${entry.target.id}`);
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((section) => sectionObserver.observe(section));

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  reveals.forEach((element) => revealObserver.observe(element));
} else {
  reveals.forEach((element) => element.classList.add('visible'));
}

// Light is the default; the toggle switches to dark and remembers the choice in this browser.
const themeToggle = document.querySelector('.theme-toggle');
const themeColor = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
  const isDark = theme === 'dark';
  if (isDark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  themeToggle.textContent = isDark ? 'Light' : 'Dark';
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  themeColor.setAttribute('content', isDark ? '#121212' : '#f3f3f1');
}

applyTheme(document.documentElement.dataset.theme);
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked: choice lasts for this visit only */ }
});

document.getElementById('current-year').textContent = new Date().getFullYear();


// Reference letter: render the PDF inside the page with PDF.js (loaded on first click only).
// If anything fails, fall back to the normal link so the PDF still opens or downloads.
const letterLink = document.querySelector('[data-letter]');
const letterViewer = document.querySelector('.letter-viewer');
const letterPages = letterViewer.querySelector('.letter-pages');
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let letterRendered = false;

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${PDFJS}pdf.min.js`;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`;
      resolve(window.pdfjsLib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function renderLetter() {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument(letterLink.href).promise;
  const width = letterPages.clientWidth - 40;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const canvases = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Reference letter from Wirk, page ${n} of ${pdf.numPages}`);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    canvases.push(canvas);
  }
  letterPages.replaceChildren(...canvases);
  letterRendered = true;
}

function closeLetter() {
  letterViewer.close();
}

letterLink.addEventListener('click', async (event) => {
  // Let modified clicks (new tab, etc.) behave like a normal link.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0 || !letterViewer.showModal) return;
  event.preventDefault();
  letterViewer.showModal();
  document.body.classList.add('letter-open');
  if (letterRendered) return;
  // Safety net: if rendering stalls (e.g. the browser pauses drawing), offer the PDF directly instead of spinning forever.
  const stallTimer = setTimeout(() => {
    if (letterRendered) return;
    const status = document.createElement('p');
    status.className = 'letter-status';
    status.append('This is taking longer than expected. ');
    const direct = document.createElement('a');
    direct.href = letterLink.href;
    direct.target = '_blank';
    direct.rel = 'noopener';
    direct.className = 'text-link';
    direct.textContent = 'Open the PDF instead';
    status.append(direct);
    letterPages.replaceChildren(status);
  }, 10000);
  try {
    await renderLetter();
    clearTimeout(stallTimer);
  } catch (error) {
    clearTimeout(stallTimer);
    closeLetter();
    window.open(letterLink.href, '_blank', 'noopener') || (window.location.href = letterLink.href);
  }
});

letterViewer.querySelector('.letter-close').addEventListener('click', closeLetter);
letterViewer.addEventListener('close', () => document.body.classList.remove('letter-open'));
// Clicking the dimmed backdrop (outside the dialog box) also closes it.
letterViewer.addEventListener('click', (event) => {
  if (event.target === letterViewer) closeLetter();
});
