const photoInput = document.getElementById('photoInput');
const expectedInput = document.getElementById('expectedInput');
const preview = document.getElementById('preview');
const verifyBtn = document.getElementById('verifyBtn');
const statusEl = document.getElementById('status');
const resultCard = document.getElementById('resultCard');

let uploadedFile = null;


// ---------------------------------------------------------
// ENABLE / DISABLE VERIFICATION BUTTON
// ---------------------------------------------------------

function checkReady() {
  verifyBtn.disabled = !(
    uploadedFile &&
    expectedInput.value.trim().length > 0
  );
}


// ---------------------------------------------------------
// IMAGE UPLOAD + PREVIEW
// ---------------------------------------------------------

photoInput.addEventListener('change', (e) => {
  uploadedFile = e.target.files[0];

  if (uploadedFile) {
    preview.src = URL.createObjectURL(uploadedFile);
    preview.style.display = 'block';
    statusEl.textContent = 'Image ready for verification.';
  } else {
    preview.style.display = 'none';
    statusEl.textContent = '';
  }

  checkReady();
});

expectedInput.addEventListener('input', checkReady);


// ---------------------------------------------------------
// IMAGE PREPROCESSING
// Converts large uploaded images into a manageable JPEG.
// This prevents OCR memory/string-length problems.
// ---------------------------------------------------------

function preprocessImage(file) {
  return new Promise((resolve, reject) => {

    const img = new Image();

    img.onload = () => {

      const MAX_SIZE = 1800;

      let width = img.naturalWidth;
      let height = img.naturalHeight;

      // Resize large images while preserving aspect ratio
      if (width > MAX_SIZE || height > MAX_SIZE) {

        const scale = Math.min(
          MAX_SIZE / width,
          MAX_SIZE / height
        );

        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d', {
        alpha: false
      });

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Draw image
      ctx.drawImage(
        img,
        0,
        0,
        width,
        height
      );

      // Convert to compressed JPEG
      canvas.toBlob(
        (blob) => {

          if (!blob) {
            reject(new Error('Could not prepare image for OCR.'));
            return;
          }

          resolve(blob);

        },
        'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      reject(new Error('Could not load the uploaded image.'));
    };

    img.src = URL.createObjectURL(file);
  });
}


// ---------------------------------------------------------
// STRING NORMALIZATION
// ---------------------------------------------------------

function normalize(str) {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}


// ---------------------------------------------------------
// LEVENSHTEIN DISTANCE
// Used to tolerate small OCR mistakes.
// Example:
// TAPE-MON-07
// TAPE-MON-O7
// ---------------------------------------------------------

function levenshtein(a, b) {

  const m = a.length;
  const n = b.length;

  const dp = Array.from(
    { length: m + 1 },
    () => new Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }

  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {

    for (let j = 1; j <= n; j++) {

      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 +
            Math.min(
              dp[i - 1][j - 1],
              dp[i - 1][j],
              dp[i][j - 1]
            );
    }
  }

  return dp[m][n];
}


// ---------------------------------------------------------
// SIMILARITY SCORE
// ---------------------------------------------------------

function similarity(a, b) {

  if (!a && !b) {
    return 1;
  }

  if (!a || !b) {
    return 0;
  }

  const distance = levenshtein(a, b);

  return 1 -
    distance /
    Math.max(a.length, b.length, 1);
}


// ---------------------------------------------------------
// FIND BEST OCR MATCH
// ---------------------------------------------------------

function findBestMatch(ocrText, expected) {

  const normalizedExpected = normalize(expected);

  let candidates = ocrText
    .split(/\s+/)
    .map(word => word.trim())
    .filter(Boolean);

  // Whole OCR result
  candidates.push(ocrText);

  // Remove punctuation from individual lines
  const lines = ocrText
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  candidates = candidates.concat(lines);

  // Combine adjacent OCR words
  const originalCandidates = [...candidates];

  for (let i = 0; i < originalCandidates.length - 1; i++) {

    candidates.push(
      originalCandidates[i] +
      originalCandidates[i + 1]
    );
  }

  let best = {
    text: '',
    score: 0
  };

  for (const candidate of candidates) {

    const normalizedCandidate = normalize(candidate);

    if (!normalizedCandidate) {
      continue;
    }

    const score = similarity(
      normalizedCandidate,
      normalizedExpected
    );

    if (score > best.score) {

      best = {
        text: candidate,
        score: score
      };
    }
  }

  return best;
}


// ---------------------------------------------------------
// DISPLAY RESULT
// ---------------------------------------------------------

function setResult(
  status,
  detected,
  expected,
  confidence,
  reason,
  action
) {

  resultCard.hidden = false;

  const rStatus =
    document.getElementById('rStatus');

  rStatus.textContent = status;

  rStatus.className =
    status === 'PASS'
      ? 'status-pass'
      : status === 'FAIL'
        ? 'status-fail'
        : 'status-uncertain';

  document.getElementById('rDetected').textContent =
    detected || '(no readable text found)';

  document.getElementById('rExpected').textContent =
    expected;

  document.getElementById('rConfidence').textContent =
    confidence;

  document.getElementById('rReason').textContent =
    reason;

  document.getElementById('rAction').textContent =
    action;
}


// ---------------------------------------------------------
// MAIN VERIFICATION PROCESS
// ---------------------------------------------------------

verifyBtn.addEventListener('click', async () => {

  const expected =
    expectedInput.value.trim();

  if (!uploadedFile || !expected) {
    return;
  }

  verifyBtn.disabled = true;

  resultCard.hidden = true;

  statusEl.textContent =
    'Preparing image for AI verification...';

  try {

    // -----------------------------------------------------
    // STEP 1 — PREPROCESS IMAGE
    // -----------------------------------------------------

    const processedImage =
      await preprocessImage(uploadedFile);

    statusEl.textContent =
      'Starting OCR engine...';


    // -----------------------------------------------------
    // STEP 2 — OCR
    // -----------------------------------------------------

    const { data } = await Tesseract.recognize(
      processedImage,
      'eng',
      {

        logger: (message) => {

          if (
            message.status === 'recognizing text'
          ) {

            statusEl.textContent =
              `Reading backup media label... ${
                Math.round(message.progress * 100)
              }%`;
          }

          else if (
            message.status === 'loading language traineddata'
          ) {

            statusEl.textContent =
              'Loading English OCR model...';
          }

          else if (
            message.status === 'initializing api'
          ) {

            statusEl.textContent =
              'Initializing AI verification engine...';
          }
        },

        // Backup identifiers contain letters,
        // numbers and hyphens.
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',

        // Assume a relatively simple text layout.
        psm: 6
      }
    );


    // -----------------------------------------------------
    // STEP 3 — GET OCR OUTPUT
    // -----------------------------------------------------

    const ocrText =
      (data.text || '').trim();

    const ocrConfidence =
      Number(data.confidence || 0);


    // -----------------------------------------------------
    // STEP 4 — MATCH OCR RESULT WITH EXPECTED ID
    // -----------------------------------------------------

    const match =
      findBestMatch(
        ocrText,
        expected
      );


    let status;
    let reason;
    let action;
    let confidenceLabel;


    // -----------------------------------------------------
    // STEP 5 — CONFIDENCE-BASED DECISION
    // -----------------------------------------------------

    if (
      !ocrText ||
      ocrConfidence < 40
    ) {

      status = 'UNCERTAIN';

      confidenceLabel =
        `Low — OCR confidence ${ocrConfidence.toFixed(0)}%`;

      reason =
        'The image quality or OCR result was not reliable enough for automatic verification.';

      action =
        'Route to IT Coordinator for review. Recapture photo if necessary.';

    }

    else if (
      match.score >= 0.80
    ) {

      status = 'PASS';

      confidenceLabel =
        `High — OCR ${ocrConfidence.toFixed(0)}%, ` +
        `identifier match ${(match.score * 100).toFixed(0)}%`;

      reason =
        'The detected identifier closely matches the expected scheduled identifier.';

      action =
        'Auto-log verification result.';

    }

    else if (
      match.score >= 0.50
    ) {

      status = 'UNCERTAIN';

      confidenceLabel =
        `Medium — OCR ${ocrConfidence.toFixed(0)}%, ` +
        `identifier match ${(match.score * 100).toFixed(0)}%`;

      reason =
        'The detected identifier is only a partial match and may represent an OCR reading error or a genuine mismatch.';

      action =
        'Route to IT Coordinator for human review.';

    }

    else {

      status = 'FAIL';

      confidenceLabel =
        `High — OCR ${ocrConfidence.toFixed(0)}%, ` +
        `identifier match ${(match.score * 100).toFixed(0)}%`;

      reason =
        'The detected identifier does not match the expected scheduled identifier.';

      action =
        'Route to IT Coordinator for review before backup execution.';
    }


    // -----------------------------------------------------
    // STEP 6 — DISPLAY RESULT
    // -----------------------------------------------------

    setResult(
      status,
      match.text || ocrText,
      expected,
      confidenceLabel,
      reason,
      action
    );

    statusEl.textContent =
      'Verification complete.';

  }

  catch (error) {

    console.error(
      'AudiTag OCR error:',
      error
    );

    statusEl.textContent =
      'OCR could not process this image. ' +
      'Try a clearer photo with the label facing the camera.';

    resultCard.hidden = true;
  }

  finally {

    verifyBtn.disabled = false;

  }

});
