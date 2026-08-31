// ============================================================
// AUDITAG — AI-ASSISTED BACKUP MEDIA VERIFICATION PROTOTYPE
// FINAL VERSION
// ============================================================


// ------------------------------------------------------------
// 1. PAGE ELEMENTS
// ------------------------------------------------------------

const photoInput = document.getElementById("photoInput");
const expectedInput = document.getElementById("expectedInput");
const operatorInput = document.getElementById("operatorInput");

const preview = document.getElementById("preview");
const verifyBtn = document.getElementById("verifyBtn");
const statusEl = document.getElementById("status");
const resultCard = document.getElementById("resultCard");

let uploadedFile = null;


// ------------------------------------------------------------
// 2. CHECK WHETHER VERIFICATION CAN START
// ------------------------------------------------------------
// All three fields are mandatory:
// Photo + Expected Identifier + Operator Name
// ------------------------------------------------------------

function checkReady() {

    verifyBtn.disabled = !(
        uploadedFile &&
        expectedInput.value.trim().length > 0 &&
        operatorInput.value.trim().length > 0
    );
}


// ------------------------------------------------------------
// 3. PHOTO UPLOAD AND PREVIEW
// ------------------------------------------------------------

photoInput.addEventListener("change", function (event) {

    uploadedFile = event.target.files[0];

    if (uploadedFile) {

        preview.src = URL.createObjectURL(uploadedFile);
        preview.style.display = "block";

        statusEl.textContent =
            "Image ready for verification.";

    } else {

        preview.style.display = "none";
        statusEl.textContent = "";
    }

    checkReady();
});


// ------------------------------------------------------------
// 4. INPUT LISTENERS
// ------------------------------------------------------------

expectedInput.addEventListener(
    "input",
    checkReady
);

operatorInput.addEventListener(
    "input",
    checkReady
);


// ------------------------------------------------------------
// 5. IMAGE PREPROCESSING
// ------------------------------------------------------------
// Large images are resized and converted to JPEG before OCR.
// This helps avoid browser memory/string-length problems.
// ------------------------------------------------------------

function preprocessImage(file) {

    return new Promise(function (resolve, reject) {

        const img = new Image();

        img.onload = function () {

            const MAX_SIZE = 1800;

            let width = img.naturalWidth;
            let height = img.naturalHeight;


            // Resize large images while preserving
            // their original aspect ratio.
            if (
                width > MAX_SIZE ||
                height > MAX_SIZE
            ) {

                const scale = Math.min(
                    MAX_SIZE / width,
                    MAX_SIZE / height
                );

                width =
                    Math.round(width * scale);

                height =
                    Math.round(height * scale);
            }


            const canvas =
                document.createElement("canvas");

            canvas.width = width;
            canvas.height = height;


            const ctx =
                canvas.getContext(
                    "2d",
                    {
                        alpha: false
                    }
                );


            // White background
            ctx.fillStyle = "#ffffff";

            ctx.fillRect(
                0,
                0,
                width,
                height
            );


            // Draw uploaded image
            ctx.drawImage(
                img,
                0,
                0,
                width,
                height
            );


            // Convert to compressed JPEG
            canvas.toBlob(
                function (blob) {

                    if (!blob) {

                        reject(
                            new Error(
                                "Could not prepare image for OCR."
                            )
                        );

                        return;
                    }


                    resolve({
                        blob: blob,
                        canvas: canvas
                    });

                },
                "image/jpeg",
                0.85
            );
        };


        img.onerror = function () {

            reject(
                new Error(
                    "Could not load the uploaded image."
                )
            );
        };


        img.src =
            URL.createObjectURL(file);
    });
}


// ------------------------------------------------------------
// 6. IMAGE QUALITY / BLUR CHECK
// ------------------------------------------------------------
// Estimates sharpness using image gradients.
// Very low sharpness is treated as unreliable.
// ------------------------------------------------------------

function calculateImageQuality(canvas) {

    const originalWidth =
        canvas.width;

    const originalHeight =
        canvas.height;


    // Downsample for faster processing
    const scale = Math.min(
        1,
        500 /
        Math.max(
            originalWidth,
            originalHeight
        )
    );


    const width =
        Math.max(
            1,
            Math.round(
                originalWidth * scale
            )
        );


    const height =
        Math.max(
            1,
            Math.round(
                originalHeight * scale
            )
        );


    const smallCanvas =
        document.createElement(
            "canvas"
        );


    smallCanvas.width = width;
    smallCanvas.height = height;


    const ctx =
        smallCanvas.getContext("2d");


    ctx.drawImage(
        canvas,
        0,
        0,
        width,
        height
    );


    const imageData =
        ctx.getImageData(
            0,
            0,
            width,
            height
        );


    const pixels =
        imageData.data;


    // Convert image to grayscale
    const gray =
        new Float32Array(
            width * height
        );


    for (
        let i = 0;
        i < gray.length;
        i++
    ) {

        const p = i * 4;

        gray[i] =
            0.299 * pixels[p] +
            0.587 * pixels[p + 1] +
            0.114 * pixels[p + 2];
    }


    // Calculate average edge strength
    let totalGradient = 0;
    let count = 0;


    for (
        let y = 1;
        y < height - 1;
        y++
    ) {

        for (
            let x = 1;
            x < width - 1;
            x++
        ) {

            const i =
                y * width + x;


            const horizontal =
                gray[i + 1] -
                gray[i - 1];


            const vertical =
                gray[i + width] -
                gray[i - width];


            const gradient =
                Math.sqrt(
                    horizontal *
                    horizontal +
                    vertical *
                    vertical
                );


            totalGradient +=
                gradient;

            count++;
        }
    }


    if (count === 0) {
        return 0;
    }


    return (
        totalGradient /
        count
    );
}


// ------------------------------------------------------------
// 7. TEXT NORMALIZATION
// ------------------------------------------------------------

function normalize(text) {

    return text
        .toUpperCase()
        .replace(
            /[^A-Z0-9]/g,
            ""
        );
}


// ------------------------------------------------------------
// 8. LEVENSHTEIN DISTANCE
// ------------------------------------------------------------
// Used to tolerate small OCR character errors.
// Example:
// TAPE-MON-07
// TAPE-MON-O7
// ------------------------------------------------------------

function levenshtein(a, b) {

    const m = a.length;
    const n = b.length;


    const matrix =
        Array.from(
            {
                length: m + 1
            },
            function () {

                return new Array(
                    n + 1
                ).fill(0);
            }
        );


    for (
        let i = 0;
        i <= m;
        i++
    ) {

        matrix[i][0] = i;
    }


    for (
        let j = 0;
        j <= n;
        j++
    ) {

        matrix[0][j] = j;
    }


    for (
        let i = 1;
        i <= m;
        i++
    ) {

        for (
            let j = 1;
            j <= n;
            j++
        ) {

            if (
                a[i - 1] ===
                b[j - 1]
            ) {

                matrix[i][j] =
                    matrix[i - 1][j - 1];

            } else {

                matrix[i][j] =
                    1 +
                    Math.min(
                        matrix[i - 1][j - 1],
                        matrix[i - 1][j],
                        matrix[i][j - 1]
                    );
            }
        }
    }


    return matrix[m][n];
}


// ------------------------------------------------------------
// 9. SIMILARITY SCORE
// ------------------------------------------------------------

function similarity(a, b) {

    if (!a && !b) {
        return 1;
    }


    if (!a || !b) {
        return 0;
    }


    const distance =
        levenshtein(a, b);


    return (
        1 -
        distance /
        Math.max(
            a.length,
            b.length,
            1
        )
    );
}


// ------------------------------------------------------------
// 10. PARSE IDENTIFIER
// ------------------------------------------------------------
// Expected format:
// TAPE-MON-07
// TAPE-TUE-07
// TAPE-WED-07
// ------------------------------------------------------------

function parseIdentifier(text) {

    const cleaned =
        text
            .toUpperCase()
            .replace(
                /\s+/g,
                ""
            );


    const match =
        cleaned.match(
            /^([A-Z]+)-([A-Z]+)-([0-9]+)$/
        );


    if (!match) {
        return null;
    }


    return {

        prefix: match[1],

        day: match[2],

        number: match[3],

        full:
            match[1] +
            "-" +
            match[2] +
            "-" +
            match[3]
    };
}


// ------------------------------------------------------------
// 11. FIND BEST OCR MATCH
// ------------------------------------------------------------

function findBestMatch(
    ocrText,
    expected
) {

    const normalizedExpected =
        normalize(expected);


    let candidates = [];


    // Individual OCR words
    const words =
        ocrText
            .split(/\s+/)
            .map(function (word) {
                return word.trim();
            })
            .filter(Boolean);


    candidates =
        candidates.concat(words);


    // Entire OCR output
    candidates.push(
        ocrText
    );


    // Individual OCR lines
    const lines =
        ocrText
            .split(/\n+/)
            .map(function (line) {
                return line.trim();
            })
            .filter(Boolean);


    candidates =
        candidates.concat(lines);


    // Combine adjacent OCR words
    for (
        let i = 0;
        i < words.length - 1;
        i++
    ) {

        candidates.push(
            words[i] +
            words[i + 1]
        );
    }


    let best = {
        text: "",
        score: 0
    };


    for (
        const candidate of candidates
    ) {

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


        if (
            score >
            best.score
        ) {

            best = {

                text: candidate,

                score: score
            };
        }
    }


    return best;
}


// ------------------------------------------------------------
// 12. DISPLAY VERIFICATION RESULT
// ------------------------------------------------------------

function setResult(
    status,
    detected,
    expected,
    operator,
    timestamp,
    confidence,
    reason,
    action
) {

    resultCard.hidden = false;


    const rStatus =
        document.getElementById(
            "rStatus"
        );


    rStatus.textContent =
        status;


    if (
        status === "PASS"
    ) {

        rStatus.className =
            "status-pass";

    } else if (
        status === "FAIL"
    ) {

        rStatus.className =
            "status-fail";

    } else {

        rStatus.className =
            "status-uncertain";
    }


    document.getElementById(
        "rDetected"
    ).textContent =
        detected ||
        "(no readable text found)";


    document.getElementById(
        "rExpected"
    ).textContent =
        expected;


    document.getElementById(
        "rOperator"
    ).textContent =
        operator;


    document.getElementById(
        "rTimestamp"
    ).textContent =
        timestamp;


    document.getElementById(
        "rConfidence"
    ).textContent =
        confidence;


    document.getElementById(
        "rReason"
    ).textContent =
        reason;


    document.getElementById(
        "rAction"
    ).textContent =
        action;
}


// ============================================================
// 13. MAIN AUDITAG VERIFICATION PROCESS
// ============================================================

verifyBtn.addEventListener(
    "click",
    async function () {


        // ----------------------------------------------------
        // GET INPUTS
        // ----------------------------------------------------

        const expected =
            expectedInput.value.trim();


        const operator =
            operatorInput.value.trim();


        // ----------------------------------------------------
        // SAFETY CHECK
        // ----------------------------------------------------

        if (
            !uploadedFile ||
            !expected ||
            !operator
        ) {

            statusEl.textContent =
                "Please provide the photo, expected identifier, and operator name.";

            return;
        }


        verifyBtn.disabled = true;

        resultCard.hidden = true;


        statusEl.textContent =
            "Preparing image for verification...";


        try {


            // ------------------------------------------------
            // STEP 1 — PREPROCESS IMAGE
            // ------------------------------------------------

            const processed =
                await preprocessImage(
                    uploadedFile
                );


            // ------------------------------------------------
            // STEP 2 — IMAGE QUALITY
            // ------------------------------------------------

            const imageQuality =
                calculateImageQuality(
                    processed.canvas
                );


            console.log(
                "AudiTag image quality:",
                imageQuality
            );


            statusEl.textContent =
                "Starting AI verification engine...";


            // ------------------------------------------------
            // STEP 3 — OCR
            // ------------------------------------------------

            const result =
                await Tesseract.recognize(
                    processed.blob,
                    "eng",
                    {

                        logger:
                            function (message) {

                                if (
                                    message.status ===
                                    "recognizing text"
                                ) {

                                    statusEl.textContent =
                                        "Reading backup media label... " +
                                        Math.round(
                                            message.progress *
                                            100
                                        ) +
                                        "%";
                                }


                                else if (
                                    message.status ===
                                    "loading language traineddata"
                                ) {

                                    statusEl.textContent =
                                        "Loading OCR model...";
                                }


                                else if (
                                    message.status ===
                                    "initializing api"
                                ) {

                                    statusEl.textContent =
                                        "Initializing verification engine...";
                                }
                            },


                        // Backup identifiers contain
                        // letters, numbers and hyphens.
                        tessedit_char_whitelist:
                            "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",


                        // Simple block of text.
                        psm: 6
                    }
                );


            // ------------------------------------------------
            // STEP 4 — READ OCR DATA
            // ------------------------------------------------

            const data =
                result.data;


            const ocrText =
                (
                    data.text ||
                    ""
                ).trim();


            const ocrConfidence =
                Number(
                    data.confidence ||
                    0
                );


            // ------------------------------------------------
            // STEP 5 — FIND BEST MATCH
            // ------------------------------------------------

            const match =
                findBestMatch(
                    ocrText,
                    expected
                );


            // ------------------------------------------------
            // STEP 6 — PARSE IDENTIFIERS
            // ------------------------------------------------

            const expectedParsed =
                parseIdentifier(
                    expected
                );


            const detectedParsed =
                parseIdentifier(
                    match.text ||
                    ocrText
                );


            let status;
            let reason;
            let action;
            let confidenceLabel;


            // =================================================
            // CASE 1 — BLURRY / UNREADABLE IMAGE
            // =================================================
            //
            // This is checked FIRST.
            //
            // A poor-quality image should NOT automatically
            // be declared a mismatch.
            //
            // Result = UNCERTAIN
            // =================================================

            const imageTooBlurry =
                imageQuality < 4;


            const ocrTooWeak =
                !ocrText ||
                ocrConfidence < 40;


            if (
                imageTooBlurry ||
                ocrTooWeak
            ) {

                status =
                    "UNCERTAIN";


                confidenceLabel =
                    "Low — Image quality " +
                    imageQuality.toFixed(1) +
                    ", OCR confidence " +
                    ocrConfidence.toFixed(0) +
                    "%";


                reason =
                    "The verification image is not sufficiently clear for reliable automatic identification.";


                action =
                    "Recapture the image and route to IT Coordinator if uncertainty remains.";
            }


            // =================================================
            // CASE 2 — CLEAR WRONG IDENTIFIER
            // =================================================
            //
            // Example:
            //
            // Detected = TAPE-MON-07
            // Expected = TAPE-TUE-07
            //
            // Result = FAIL
            // =================================================

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

                status =
                    "FAIL";


                confidenceLabel =
                    "High — OCR " +
                    ocrConfidence.toFixed(0) +
                    "%, identifier mismatch";


                reason =
                    "Detected identifier " +
                    detectedParsed.full +
                    " does not match the scheduled identifier " +
                    expectedParsed.full +
                    ".";


                action =
                    "Do not auto-log as compliant. Route to IT Coordinator for review.";
            }


            // =================================================
            // CASE 3 — EXACT MATCH
            // =================================================

            else if (
                normalize(
                    match.text
                ) ===
                normalize(
                    expected
                )
            ) {

                status =
                    "PASS";


                confidenceLabel =
                    "High — OCR " +
                    ocrConfidence.toFixed(0) +
                    "%, exact identifier match";


                reason =
                    "Detected identifier exactly matches the expected scheduled identifier.";


                action =
                    "Auto-log verification result.";
            }


            // =================================================
            // CASE 4 — MINOR OCR ERROR
            // =================================================
            //
            // Example:
            //
            // Expected = TAPE-MON-07
            // OCR      = TAPE-MON-O7
            //
            // A small OCR error can still PASS.
            // =================================================

            else if (
                match.score >= 0.80
            ) {

                status =
                    "PASS";


                confidenceLabel =
                    "High — OCR " +
                    ocrConfidence.toFixed(0) +
                    "%, identifier match " +
                    Math.round(
                        match.score * 100
                    ) +
                    "%";


                reason =
                    "Detected identifier closely matches the expected identifier, allowing for a minor OCR character-reading error.";


                action =
                    "Auto-log verification result.";
            }


            // =================================================
            // CASE 5 — AMBIGUOUS PARTIAL MATCH
            // =================================================

            else if (
                match.score >= 0.50
            ) {

                status =
                    "UNCERTAIN";


                confidenceLabel =
                    "Medium — OCR " +
                    ocrConfidence.toFixed(0) +
                    "%, identifier match " +
                    Math.round(
                        match.score * 100
                    ) +
                    "%";


                reason =
                    "The detected text is only a partial identifier match and cannot be reliably classified automatically.";


                action =
                    "Route to IT Coordinator for human review.";
            }


            // =================================================
            // CASE 6 — CLEAR MISMATCH
            // =================================================

            else {

                status =
                    "FAIL";


                confidenceLabel =
                    "High — OCR " +
                    ocrConfidence.toFixed(0) +
                    "%, identifier mismatch";


                reason =
                    "The detected identifier does not match the expected scheduled identifier.";


                action =
                    "Route to IT Coordinator for review before backup execution.";
            }


            // ------------------------------------------------
            // STEP 7 — CREATE TIMESTAMP
            // ------------------------------------------------

            const verificationTime =
                new Date().toLocaleString(
                    "en-IN",
                    {
                        dateStyle: "medium",
                        timeStyle: "medium"
                    }
                );


            // ------------------------------------------------
            // STEP 8 — DISPLAY RESULT
            // ------------------------------------------------

            setResult(
                status,
                match.text || ocrText,
                expected,
                operator,
                verificationTime,
                confidenceLabel,
                reason,
                action
            );


            statusEl.textContent =
                "Verification complete.";
        }


        // ----------------------------------------------------
        // ERROR HANDLING
        // ----------------------------------------------------

        catch (error) {

            console.error(
                "AudiTag OCR error:",
                error
            );


            statusEl.textContent =
                "OCR could not process this image. " +
                "Try a clearer photo with the label facing the camera.";


            resultCard.hidden = true;
        }


        // ----------------------------------------------------
        // RE-ENABLE BUTTON
        // ----------------------------------------------------

        finally {

            verifyBtn.disabled = false;
        }

    }
);
