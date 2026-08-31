const photoInput = document.getElementById('photoInput');
const expectedInput = document.getElementById('expectedInput');
const preview = document.getElementById('preview');
const verifyBtn = document.getElementById('verifyBtn');
const statusEl = document.getElementById('status');
const resultCard = document.getElementById('resultCard');

let uploadedFile = null;


// =========================================================
// READY CHECK
// =========================================================

function checkReady() {
  verifyBtn.disabled = !(
    uploadedFile &&
    expectedInput.value.trim().length > 0
  );
}


// =========================================================
// IMAGE UPLOAD
// =========================================================

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


// =========================================================
// IMAGE PREPROCESSING
// =========================================================

function preprocessImage(file) {

  return new Promise((resolve, reject) => {

    const img = new Image();

    img.onload = () => {

      const MAX_SIZE = 1800;

      let width = img.naturalWidth;
      let height = img.naturalHeight;

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

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(
        img,
        0,
        0,
        width,
        height
      );

      canvas.toBlob(
        (blob) => {

          if (!blob) {
            reject(
              new Error('Could not prepare image.')
            );
            return;
          }

          resolve({
            blob: blob,
            canvas: canvas
          });

        },
        'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      reject(
        new Error('Could not load uploaded image.')
      );
    };

    img.src = URL.createObjectURL(file);
  });
}


// =========================================================
// IMAGE QUALITY CHECK
//
// Uses variance of image gradients as a simple sharpness
// indicator. Very blurry images are sent for human review.
// =========================================================

function calculateImageQuality(canvas) {

  const ctx = canvas.getContext('2d');

  const width = canvas.width;
  const height = canvas.height;

  // Downsample for faster calculation
  const scale = Math.min(
    1,
    500 / Math.max(width, height)
  );

  const smallWidth = Math.max(
    1,
    Math.round(width * scale)
  );

  const smallHeight = Math.max(
    1,
    Math.round(height * scale)
  );

  const tempCanvas = document.createElement('canvas');

  tempCanvas.width = smallWidth;
  tempCanvas.height = smallHeight;

  const tempCtx = tempCanvas.getContext('2d');

  tempCtx.drawImage(
    canvas,
    0,
    0,
    smallWidth,
    smallHeight
  );

  const imageData = tempCtx.getImageData(
    0,
    0,
    smallWidth,
    smallHeight
  );

  const pixels = imageData.data;

  const gray = new Float32Array(
    smallWidth * smallHeight
  );

  // Convert to grayscale
  for (let i = 0; i < gray.length; i++) {

    const p = i * 4;

    gray[i] =
      0.299 * pixels[p] +
      0.587 * pixels[p + 1] +
      0.114 * pixels[p + 2];
  }

  // Calculate average horizontal + vertical gradient
  let sum = 0;
  let count = 0;

  for (let y = 1; y < smallHeight - 1; y++) {

    for (let x = 1; x < smallWidth - 1; x++) {

      const i = y * smallWidth + x;

      const gx =
        gray[i + 1] -
        gray[i - 1];

      const gy =
        gray[i + smallWidth] -
        gray[i - smallWidth];

      const magnitude =
        Math.sqrt(
          gx * gx +
          gy * gy
        );

      sum += magnitude;
      count++;
    }
  }

  const averageGradient =
    count > 0
      ? sum / count
      : 0;

  return averageGradient;
}


// =========================================================
// NORMALIZE TEXT
// =========================================================

function normalize(str) {

  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}


// =========================================================
// LEVENSHTEIN DISTANCE
// =========================================================

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
          : 1 + Math.min(
              dp[i - 1][j - 1],
              dp[i - 1][j],
              dp[i][j - 1]
            );
    }
  }

  return dp[m][n];
}


// =========================================================
// SIMILARITY
// =========================================================

function similarity(a, b) {

  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const distance = levenshtein(a, b);

  return 1 -
    distance /
    Math.max(a.length, b.length, 1);
}


// =========================================================
// EXTRACT STRUCTURED IDENTIFIER
//
// Example:
// TAPE-MON-07
// TAPE-TUE-07
//
// This prevents MON from being treated as a near match
// for TUE when the image is clearly readable.
// =========================================================

function parseIdentifier(str) {

  const cleaned = str
    .toUpperCase()
    .replace(/\s+/g, '');

  const match = cleaned.match(
    /([A-Z]+)-([A-Z]+)-([0-9]+)/ 
  );

  if (!match) {
    return null;
  }

  return {
    prefix: match[1],
    day: match[2],
    number: match[3],
    full: `${match[1]}-${match[2]}-${match[3]}`
  };
}


// =========================================================
// FIND BEST OCR MATCH
// =========================================================

function findBestMatch(ocrText, expected) {

  const normalizedExpected =
    normalize(expected);

  let candidates = ocrText
    .split(/\s+/)
    .map(x => x.trim())
    .filter(Boolean);

  candidates.push(ocrText);

  const lines = ocrText
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean);

  candidates = candidates.concat(lines);

  let best = {
    text: '',
    score: 0
  };

  for (const candidate of candidates) {

    const normalizedCandidate =
      normalize(candidate);

    if (!normalizedCandidate) {
      continue;
    }

    const score =
      similarity(
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


// =========================================================
// DISPLAY RESULT
// =========================================================

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


// =========================================================
// MAIN VERIFICATION
// =========================================================

verifyBtn.addEventListener('click', async () => {

  const expected =
    expectedInput.value.trim();

  if (!uploadedFile || !expected) {
    return;
  }

  verifyBtn.disabled = true;
  resultCard.hidden = true;

  statusEl.textContent =
    'Preparing image for verification...';

  try {

    // -----------------------------------------------------
    // STEP 1 — IMAGE PREPROCESSING
    // -----------------------------------------------------

    const processed =
      await preprocessImage(uploadedFile);

    const imageQuality =
      calculateImageQuality(
        processed.canvas
      );

    console.log(
      'AudiTag image quality:',
      imageQuality
    );

    statusEl.textContent =
      'Starting AI verification engine...';


    // -----------------------------------------------------
    // STEP 2 — OCR
    // -----------------------------------------------------

    const { data } =
      await Tesseract.recognize(
        processed.blob,
        'eng',
        {

          logger: (message) => {

            if (
              message.status ===
              'recognizing text'
            ) {

              statusEl.textContent =
                `Reading backup media label... ${
                  Math.round(
                    message.progress * 100
                  )
                }%`;
            }

            else if (
              message.status ===
              'loading language traineddata'
            ) {

              statusEl.textContent =
                'Loading OCR model...';
            }

            else if (
              message.status ===
              'initializing api'
            ) {

              statusEl.textContent =
                'Initializing verification engine...';
            }
          },

          tessedit_char_whitelist:
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',

          psm: 6
        }
      );


    // -----------------------------------------------------
    // STEP 3 — OCR RESULTS
    // -----------------------------------------------------

    const ocrText =
      (data.text || '').trim();

    const ocrConfidence =
      Number(data.confidence || 0);

    const match =
      findBestMatch(
        ocrText,
        expected
      );


    // -----------------------------------------------------
    // STEP 4 — STRUCTURED IDENTIFIER CHECK
    // -----------------------------------------------------

    const expectedParsed =
      parseIdentifier(expected);

    const detectedParsed =
      parseIdentifier(match.text || ocrText);


    let status;
    let reason;
    let action;
    let confidenceLabel;


    // -----------------------------------------------------
    // CASE 1 — VERY POOR IMAGE / OCR
    //
    // IMPORTANT:
    // This check happens BEFORE mismatch detection.
    // Therefore a genuinely blurry image is UNCERTAIN.
    // -----------------------------------------------------

    const imageTooBlurry =
      imageQuality < 4;

    const ocrTooWeak =
      !ocrText ||
      ocrConfidence < 40;

    if (
      imageTooBlurry ||
      ocrTooWeak
    ) {

      status = 'UNCERTAIN';

      confidenceLabel =
        `Low — Image quality ${imageQuality.toFixed(1)}, ` +
        `OCR confidence ${ocrConfidence.toFixed(0)}%`;

      reason =
        'The verification image is not sufficiently clear for reliable automatic identification.';

      action =
        'Recapture the image and route to IT Coordinator if uncertainty remains.';
    }


    // -----------------------------------------------------
    // CASE 2 — CLEAR STRUCTURED IDENTIFIER MISMATCH
    //
    // Example:
    // Expected: TAPE-TUE-07
    // Detected: TAPE-MON-07
    //
    // This MUST be FAIL.
    // -----------------------------------------------------

    else if (
      expectedParsed &&
      detectedParsed &&
      (
        expectedParsed.prefix !==
          detectedParsed.prefix ||

        expectedParsed.day !==
          detectedParsed.day ||

        expectedParsed.number !==
          detectedParsed.number
      )
    ) {

      status = 'FAIL';

      confidenceLabel =
        `High — OCR ${ocrConfidence.toFixed(0)}%, ` +
        `identifier match ${(match.score * 100).toFixed(0)}%`;

      reason =
        `Detected identifier ${detectedParsed.full} does not match the scheduled identifier ${expectedParsed.full}.`;

      action =
        'Do not auto-log as compliant. Route to IT Coordinator for review.';
    }


    // -----------------------------------------------------
    // CASE 3 — CLEAR EXACT MATCH
    // -----------------------------------------------------

    else if (
      normalize(match.text) ===
      normalize(expected)
    ) {

      status = 'PASS';

      confidenceLabel =
        `High — OCR ${ocrConfidence.toFixed(0)}%, ` +
        `exact identifier match`;

      reason =
        'Detected identifier exactly matches the expected scheduled identifier.';

      action =
        'Auto-log verification result.';
    }


    // -----------------------------------------------------
    // CASE 4 — FUZZY OCR MATCH
    //
    // Example:
    // Expected: TAPE-MON-07
    // OCR:      TAPE-MON-O7
    //
    // Small OCR character mistakes can still pass.
    // -----------------------------------------------------

    else if (
      match.score >= 0.80
    ) {

      status = 'PASS';

      confidenceLabel =
        `High — OCR ${ocrConfidence.toFixed(0)}%, ` +
        `identifier match ${(match.score * 100).toFixed(0)}%`;

      reason =
        'Detected identifier closely matches the expected identifier, allowing for a minor OCR character-reading error.';

      action =
        'Auto-log verification result.';
    }


    // -----------------------------------------------------
    // CASE 5 — UNCERTAIN PARTIAL MATCH
    // -----------------------------------------------------

    else if (
      match.score >= 0.50
    ) {

      status = 'UNCERTAIN';

      confidenceLabel =
        `Medium — OCR ${ocrConfidence.toFixed(0)}%, ` +
        `identifier match ${(match.score * 100).toFixed(0)}%`;

      reason =
        'The detected text is only a partial identifier match and cannot be reliably classified automatically.';

      action =
        'Route to IT Coordinator for human review.';
    }


    // -----------------------------------------------------
    // CASE 6 — CLEAR MISMATCH
    // -----------------------------------------------------

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
    // DISPLAY
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
      'OCR could not process this image. Try a clearer photo.';

    resultCard.hidden = true;
  }

  finally {

    verifyBtn.disabled = false;
  }

});
