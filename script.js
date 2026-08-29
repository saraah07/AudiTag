const photoInput = document.getElementById('photoInput');
const expectedInput = document.getElementById('expectedInput');
const preview = document.getElementById('preview');
const verifyBtn = document.getElementById('verifyBtn');
const statusEl = document.getElementById('status');
const resultCard = document.getElementById('resultCard');

let uploadedFile = null;

function checkReady() {
  verifyBtn.disabled = !(uploadedFile && expectedInput.value.trim().length > 0);
}

photoInput.addEventListener('change', (e) => {
  uploadedFile = e.target.files[0];
  if (uploadedFile) {
    preview.src = URL.createObjectURL(uploadedFile);
    preview.style.display = 'block';
  }
  checkReady();
});

expectedInput.addEventListener('input', checkReady);

// Normalize strings for comparison: uppercase, strip non-alphanumerics
function normalize(str) {
  return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length, 1);
}

function findBestMatch(ocrText, expected) {
  const normExpected = normalize(expected);
  const candidates = ocrText.split(/\s+/).filter(Boolean);
  // Also try the whole text as one candidate, and consecutive-pair joins
  candidates.push(ocrText);
  for (let i = 0; i < candidates.length - 1; i++) {
    candidates.push(candidates[i] + candidates[i + 1]);
  }
  let best = { text: '', score: 0 };
  for (const c of candidates) {
    const normC = normalize(c);
    if (!normC) continue;
    const score = similarity(normC, normExpected);
    if (score > best.score) best = { text: c, score };
  }
  return best;
}

function setResult(status, detected, expected, confidence, reason, action) {
  resultCard.hidden = false;
  const rStatus = document.getElementById('rStatus');
  rStatus.textContent = status;
  rStatus.className = status === 'PASS' ? 'status-pass' : status === 'FAIL' ? 'status-fail' : 'status-uncertain';
  document.getElementById('rDetected').textContent = detected || '(no readable text found)';
  document.getElementById('rExpected').textContent = expected;
  document.getElementById('rConfidence').textContent = confidence;
  document.getElementById('rReason').textContent = reason;
  document.getElementById('rAction').textContent = action;
}

verifyBtn.addEventListener('click', async () => {
  const expected = expectedInput.value.trim();
  verifyBtn.disabled = true;
  statusEl.textContent = 'Running OCR — this can take a few seconds...';
  resultCard.hidden = true;

  try {
    const { data } = await Tesseract.recognize(preview.src, 'eng', {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4.1.1/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4.0.4/tesseract-core.wasm.js',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      logger: (m) => {
        if (m.status === 'recognizing text') {
          statusEl.textContent = `Reading label... ${Math.round(m.progress * 100)}%`;
        }
      },
    });

    const ocrText = (data.text || '').trim();
    const ocrConfidence = data.confidence; // 0-100 from Tesseract
    const match = findBestMatch(ocrText, expected);

    let status, reason, action, confidenceLabel;

    if (!ocrText || ocrConfidence < 40) {
      status = 'UNCERTAIN';
      confidenceLabel = `Low (OCR confidence ${ocrConfidence.toFixed(0)}%)`;
      reason = 'Image quality too poor for reliable text extraction. Recapture recommended.';
      action = 'Route to IT Coordinator for review';
    } else if (match.score >= 0.8) {
      status = 'PASS';
      confidenceLabel = `High (OCR ${ocrConfidence.toFixed(0)}%, text match ${(match.score * 100).toFixed(0)}%)`;
      reason = 'Detected identifier closely matches the expected scheduled identifier.';
      action = 'Auto-log result';
    } else if (match.score >= 0.5) {
      status = 'UNCERTAIN';
      confidenceLabel = `Medium (OCR ${ocrConfidence.toFixed(0)}%, text match ${(match.score * 100).toFixed(0)}%)`;
      reason = 'Partial match only — could be an OCR misread or a genuine mismatch.';
      action = 'Route to IT Coordinator for review';
    } else {
      status = 'FAIL';
      confidenceLabel = `High (OCR ${ocrConfidence.toFixed(0)}%, text match ${(match.score * 100).toFixed(0)}%)`;
      reason = 'Detected identifier does not match the expected scheduled identifier.';
      action = 'Route to IT Coordinator for review';
    }

    setResult(status, match.text || ocrText, expected, confidenceLabel, reason, action);
    statusEl.textContent = 'Verification complete.';
  } catch (err) {
    statusEl.textContent = 'Error running OCR: ' + err.message;
  } finally {
    verifyBtn.disabled = false;
  }
});
