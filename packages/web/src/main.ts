import {
  type ABI,
  ClearSigner,
  type DecodedTransaction,
  type ERC7730Descriptor,
  SUPPORTED_CHAINS,
  fetchFromSourcify,
  generateDescriptor,
  getDefaultRpc,
} from '@erc7730/sdk';

// GitHub repository configuration
const GITHUB_REPO = 'ethereum/clear-signing-erc7730-registry';
const GITHUB_REGISTRY_PATH = 'registry';

// Example transactions
const EXAMPLES = {
  transfer: {
    calldata:
      '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100',
    contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chain: '1',
  },
  approve: {
    calldata:
      '0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000de0b6b3a7640000',
    contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chain: '1',
  },
  infinite: {
    calldata:
      '0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25effFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
    contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chain: '1',
  },
  nft: {
    calldata:
      '0x42842e0e000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000abcdef1234567890abcdef1234567890abcdef120000000000000000000000000000000000000000000000000000000000000539',
    contract: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
    chain: '1',
  },
};

// Current state
let currentInput: { calldata: string; contract: string; chainId: number } | null = null;
let customDescriptor: ERC7730Descriptor | null = null;
let lastGeneratedDescriptor: ERC7730Descriptor | null = null;

// ============================================================================
// DOM Elements - Decode Tab
// ============================================================================
const calldataInput = document.getElementById('calldata') as HTMLTextAreaElement;
const chainSelect = document.getElementById('chain') as HTMLSelectElement;
const contractInput = document.getElementById('contract') as HTMLInputElement;
const rpcInput = document.getElementById('rpc') as HTMLInputElement;
const customAbiInput = document.getElementById('custom-abi') as HTMLTextAreaElement;
const applyAbiBtn = document.getElementById('apply-abi-btn') as HTMLButtonElement;
const decodeBtn = document.getElementById('decode-btn') as HTMLButtonElement;
const resultDiv = document.getElementById('result') as HTMLDivElement;
const customDescriptorIndicator = document.getElementById(
  'custom-descriptor-indicator'
) as HTMLDivElement;
const clearCustomDescriptorBtn = document.getElementById(
  'clear-custom-descriptor'
) as HTMLButtonElement;

// ============================================================================
// DOM Elements - Generate Tab
// ============================================================================
const genAbiInput = document.getElementById('gen-abi') as HTMLTextAreaElement;
const genChainSelect = document.getElementById('gen-chain') as HTMLSelectElement;
const genAddressInput = document.getElementById('gen-address') as HTMLInputElement;
const genOwnerInput = document.getElementById('gen-owner') as HTMLInputElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const fetchSourcifyBtn = document.getElementById('fetch-sourcify-btn') as HTMLButtonElement;
const useForDecodeBtn = document.getElementById('use-for-decode-btn') as HTMLButtonElement;
const generateResultDiv = document.getElementById('generate-result') as HTMLDivElement;

// ============================================================================
// Main Tab Navigation
// ============================================================================
document.querySelectorAll('.main-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabId = (tab as HTMLElement).dataset.mainTab;
    if (!tabId) return;

    // Update active tab
    document.querySelectorAll('.main-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    // Update active content
    document.querySelectorAll('.main-tab-content').forEach((c) => c.classList.remove('active'));
    document.getElementById(`main-tab-${tabId}`)?.classList.add('active');
  });
});

// ============================================================================
// Chain Select Initialization
// ============================================================================
function populateChainSelect(selectElement: HTMLSelectElement) {
  selectElement.innerHTML = '';
  for (const [chainId, chain] of Object.entries(SUPPORTED_CHAINS)) {
    const option = document.createElement('option');
    option.value = chainId;
    option.textContent = chain.name;
    selectElement.appendChild(option);
  }
  selectElement.value = '1';
}

function updateRpcPlaceholder() {
  const chainId = Number.parseInt(chainSelect.value);
  const defaultRpc = getDefaultRpc(chainId);
  rpcInput.placeholder = defaultRpc || 'No default RPC available';
}

// Initialize chain selects
populateChainSelect(chainSelect);
populateChainSelect(genChainSelect);
updateRpcPlaceholder();
chainSelect.addEventListener('change', updateRpcPlaceholder);

// ============================================================================
// Custom Descriptor Management
// ============================================================================
function setCustomDescriptor(descriptor: ERC7730Descriptor) {
  customDescriptor = descriptor;
  customDescriptorIndicator.style.display = 'flex';
}

function clearCustomDescriptor() {
  customDescriptor = null;
  customDescriptorIndicator.style.display = 'none';
}

clearCustomDescriptorBtn.addEventListener('click', clearCustomDescriptor);

// Apply ABI as custom descriptor
applyAbiBtn.addEventListener('click', () => {
  const abiText = customAbiInput.value.trim();
  const address = contractInput.value.trim();
  const chainId = Number.parseInt(chainSelect.value);

  if (!abiText) {
    alert('Please enter an ABI');
    return;
  }

  try {
    const abi = JSON.parse(abiText) as ABI;
    const descriptor = generateDescriptor({
      chainId,
      address: address || '0x0000000000000000000000000000000000000000',
      abi,
      owner: 'Custom',
    });
    setCustomDescriptor(descriptor);
  } catch (error) {
    alert(`Failed to generate descriptor: ${(error as Error).message}`);
  }
});

// ============================================================================
// Load Examples
// ============================================================================
document.querySelectorAll('.example-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const example = (btn as HTMLElement).dataset.example as keyof typeof EXAMPLES;
    const data = EXAMPLES[example];
    if (data) {
      calldataInput.value = data.calldata;
      contractInput.value = data.contract;
      chainSelect.value = data.chain;
      updateRpcPlaceholder();
    }
  });
});

// ============================================================================
// Decode Transaction
// ============================================================================
decodeBtn.addEventListener('click', async () => {
  const calldata = calldataInput.value.trim();
  const chainId = Number.parseInt(chainSelect.value);
  const contract = contractInput.value.trim() || '0x0000000000000000000000000000000000000000';
  const customRpcUrl = rpcInput.value.trim();

  if (!calldata) {
    showError('Please enter calldata or transaction hash');
    return;
  }

  currentInput = { calldata, contract, chainId };

  decodeBtn.disabled = true;
  decodeBtn.textContent = 'Decoding...';

  try {
    // Create signer with custom RPC if provided
    const signer = customRpcUrl ? new ClearSigner({ rpcUrl: customRpcUrl }) : new ClearSigner();

    // Add custom descriptor if set
    if (customDescriptor) {
      signer.extend([customDescriptor]);
    }

    const result = await signer.decode({
      to: contract,
      data: calldata,
      chainId,
    });

    renderResult(result);
  } catch (error) {
    showError(`Failed to decode: ${(error as Error).message}`);
  } finally {
    decodeBtn.disabled = false;
    decodeBtn.textContent = 'Decode Transaction';
  }
});

// ============================================================================
// Generate Descriptor
// ============================================================================
generateBtn.addEventListener('click', () => {
  const abiText = genAbiInput.value.trim();
  const chainId = Number.parseInt(genChainSelect.value);
  const address = genAddressInput.value.trim();
  const owner = genOwnerInput.value.trim();

  if (!abiText) {
    showGenerateError('Please enter an ABI or use "Fetch from Sourcify" button');
    return;
  }

  try {
    const abi = JSON.parse(abiText) as ABI;
    const descriptor = generateDescriptor({
      chainId,
      address: address || '0x0000000000000000000000000000000000000000',
      abi,
      owner: owner || undefined,
    });

    lastGeneratedDescriptor = descriptor;
    renderGenerateResult(descriptor, false);
  } catch (error) {
    showGenerateError(`Failed to generate: ${(error as Error).message}`);
  }
});

// Fetch ABI from Sourcify
fetchSourcifyBtn.addEventListener('click', async () => {
  const chainId = Number.parseInt(genChainSelect.value);
  const address = genAddressInput.value.trim();

  if (!address) {
    showGenerateError('Please enter a contract address to fetch from Sourcify');
    return;
  }

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    showGenerateError('Invalid contract address format');
    return;
  }

  fetchSourcifyBtn.disabled = true;
  fetchSourcifyBtn.textContent = 'Fetching...';

  try {
    const result = await fetchFromSourcify(chainId, address);

    if (!result.verified || !result.abi) {
      showGenerateError(
        `Contract not found on Sourcify. Make sure the contract is verified on chain ${chainId}.`
      );
      return;
    }

    // Fill in the ABI textarea
    genAbiInput.value = JSON.stringify(result.abi, null, 2);

    // If we got a name from Sourcify, use it
    if (result.name && !genOwnerInput.value.trim()) {
      genOwnerInput.value = result.name;
    }

    // Generate the descriptor
    const descriptor = generateDescriptor({
      chainId,
      address,
      abi: result.abi,
      owner: genOwnerInput.value.trim() || result.name || undefined,
    });

    lastGeneratedDescriptor = descriptor;
    renderGenerateResult(descriptor, true); // true = from Sourcify
  } catch (error) {
    showGenerateError(`Failed to fetch from Sourcify: ${(error as Error).message}`);
  } finally {
    fetchSourcifyBtn.disabled = false;
    fetchSourcifyBtn.textContent = 'Fetch from Sourcify';
  }
});

// Use generated descriptor for decoding
useForDecodeBtn.addEventListener('click', () => {
  if (!lastGeneratedDescriptor) return;

  setCustomDescriptor(lastGeneratedDescriptor);

  // Switch to decode tab
  document.querySelectorAll('.main-tab').forEach((t) => t.classList.remove('active'));
  document.querySelector('.main-tab[data-main-tab="decode"]')?.classList.add('active');

  document.querySelectorAll('.main-tab-content').forEach((c) => c.classList.remove('active'));
  document.getElementById('main-tab-decode')?.classList.add('active');
});

// ============================================================================
// GitHub Contribution
// ============================================================================
function generateFileName(descriptor: ERC7730Descriptor): string {
  const deployment = descriptor.context.contract?.deployments?.[0];
  const address = deployment?.address?.toLowerCase() || 'unknown';
  const chainId = deployment?.chainId || 1;
  const owner = descriptor.metadata?.owner?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'custom';
  return `${owner}-${chainId}-${address.slice(0, 10)}.json`;
}

async function openContributePR(descriptor: ERC7730Descriptor) {
  const fileName = generateFileName(descriptor);
  const content = JSON.stringify(descriptor, replacer, 2);

  // Copy descriptor to clipboard
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = content;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  // Open GitHub new file page (without the content in URL to avoid length issues)
  const url = `https://github.com/${GITHUB_REPO}/new/main/${GITHUB_REGISTRY_PATH}?filename=${fileName}`;
  window.open(url, '_blank');

  // Show instructions modal
  showClipboardInstructions(fileName);
}

function showClipboardInstructions(fileName: string) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Draft copied</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <p>The generated JSON is on your clipboard. This is an untrusted draft — review it before proposing a file on
        <strong>ethereum/clear-signing-erc7730-registry</strong> (not this SDK repo).</p>

        <div class="instructions-box">
          <p><strong>In the official-registry tab that just opened:</strong></p>
          <ol>
            <li>Paste the content (<kbd>Ctrl+V</kbd> or <kbd>Cmd+V</kbd>)</li>
            <li>Review labels and formats — do not submit raw ABI guesses as curated metadata</li>
            <li>Propose the file on the official registry</li>
          </ol>
        </div>

        <p class="modal-note">
          <strong>File name:</strong> <code>${escapeHtml(fileName)}</code>
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn-primary modal-close-btn">Got it!</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Event listeners
  const closeModal = () => overlay.remove();

  overlay.querySelector('.modal-close')?.addEventListener('click', closeModal);
  overlay.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

function showContributePopup(descriptor: ERC7730Descriptor) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Official registry — not this repo</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <p>This JSON is an <strong>untrusted ABI draft</strong>. Curated ERC-7730 metadata belongs in
        <a href="https://github.com/ethereum/clear-signing-erc7730-registry" target="_blank" rel="noreferrer">ethereum/clear-signing-erc7730-registry</a>,
        not MiltonTulli/ERC-7730. Review it before proposing a file upstream.</p>

        <div class="modal-preview">
          <div class="field">
            <span class="field-label">Protocol</span>
            <span class="field-value">${escapeHtml(descriptor.metadata?.owner || 'Unknown')}</span>
          </div>
          <div class="field">
            <span class="field-label">Contract</span>
            <span class="field-value">${escapeHtml(descriptor.context.contract?.deployments?.[0]?.address?.slice(0, 20) || 'N/A')}...</span>
          </div>
          <div class="field">
            <span class="field-label">Functions</span>
            <span class="field-value">${Object.keys(descriptor.display.formats).length}</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary modal-cancel">Close</button>
        <button class="btn-secondary modal-contribute">
          Open official registry
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Event listeners
  overlay.querySelector('.modal-close')?.addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('.modal-cancel')?.addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('.modal-contribute')?.addEventListener('click', () => {
    openContributePR(descriptor);
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

// ============================================================================
// Render Functions
// ============================================================================
function generateCodeSnippet(result: DecodedTransaction): string {
  if (!currentInput) return '// No input available';

  const customDescriptorCode = customDescriptor
    ? `
// Local override for legacy ClearSigner.decode (TrustPolicy is decodeTransaction-only)
const customDescriptor = ${JSON.stringify(customDescriptor, replacer, 2)};

signer.extend([customDescriptor]);
`
    : '';

  return `import { ClearSigner } from '@erc7730/sdk';

const signer = new ClearSigner();
${customDescriptorCode}
const result = await signer.decode({
  to: '${currentInput.contract}',
  data: '${currentInput.calldata}',
  chainId: ${currentInput.chainId},
});

console.log(result.intent);       // "${result.intent}"
console.log(result.source);       // "${result.source}"
console.log(result.confidence);   // "${result.confidence}" — treat "high" only for trusted registry metadata
console.log(result.warnings);`;
}

type TrustDisplay = {
  accepted: boolean;
  label: string;
  note: string;
};

function getTrustDisplay(source: string, custom: boolean): TrustDisplay {
  if (
    source === 'sourcify' ||
    source === 'inferred' ||
    source === 'basic' ||
    source === 'generated' ||
    custom
  ) {
    return {
      accepted: false,
      label: 'false',
      note: 'Sourcify / generateDescriptor / inferred is an untrusted fallback. Never confidence: "high". officialOnlyPolicy() sets trust.accepted: false.',
    };
  }
  return {
    accepted: false,
    label: 'pending',
    note: 'v1 ClearSigner uses an embedded catalog. Prefer decodeTransaction with createOfficialRegistry({ pin }) and officialOnlyPolicy() in production.',
  };
}

function getSourceBadge(source: string): string {
  switch (source) {
    case 'registry':
      return '<span class="badge badge-success">source: registry</span>';
    case 'sourcify':
      return '<span class="badge badge-warning">source: sourcify</span>';
    case 'inferred':
      return '<span class="badge badge-warning">source: inferred</span>';
    case 'basic':
      return '<span class="badge badge-error">source: basic</span>';
    default:
      return `<span class="badge" style="background: var(--bg-tertiary); color: var(--text-muted);">source: ${escapeHtml(source)}</span>`;
  }
}

function getConfidenceBadge(result: DecodedTransaction, custom: boolean): string {
  if (result.source === 'sourcify' || custom) {
    return '<span class="badge badge-warning">Untrusted fallback</span>';
  }
  if (result.source === 'inferred') {
    return '<span class="badge badge-warning">Inferred</span>';
  }
  if (result.source === 'basic') {
    return '<span class="badge badge-error">Basic</span>';
  }
  if (result.confidence === 'high') {
    return '<span class="badge badge-success">Registry metadata</span>';
  }
  if (result.confidence === 'medium') {
    return '<span class="badge badge-warning">Medium confidence</span>';
  }
  return '<span class="badge badge-error">Low confidence</span>';
}

function renderResult(result: DecodedTransaction) {
  const trust = getTrustDisplay(result.source, Boolean(customDescriptor));
  const confidenceBadge = getConfidenceBadge(result, Boolean(customDescriptor));
  const sourceBadge = getSourceBadge(result.source);
  const trustBadge = `<span class="badge ${trust.label === 'false' ? 'badge-warning' : 'badge-error'}">trust.accepted: ${trust.label}</span>`;

  const customBadge = customDescriptor
    ? '<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: var(--accent);">Local override</span>'
    : '';

  const warningsHtml = result.warnings
    .map(
      (w) => `
      <div class="warning">
        <span class="warning-icon">⚠️</span>
        <span class="warning-text">${escapeHtml(w.message)}</span>
      </div>
    `
    )
    .join('');

  const fieldsHtml = result.fields
    .map(
      (f) => `
      <div class="field">
        <span class="field-label">${escapeHtml(f.label)}</span>
        <span class="field-value">${escapeHtml(f.value)}</span>
      </div>
    `
    )
    .join('');

  const jsonOutput = {
    intent: result.intent,
    confidence: result.confidence,
    source: result.source,
    trust: { accepted: trust.accepted, status: trust.label },
    functionName: result.functionName,
    signature: result.signature,
    fields: result.fields.map((f) => ({
      label: f.label,
      value: f.value,
      path: f.path,
      format: f.format,
    })),
    warnings: result.warnings,
    metadata: result.metadata,
    raw: result.raw,
  };

  const codeSnippet = generateCodeSnippet(result);

  const untrustedBanner =
    result.source === 'sourcify' || result.source === 'inferred' || result.source === 'basic'
      ? `<div class="untrusted-banner">
        <span>${escapeHtml(trust.note)}</span>
      </div>`
      : '';

  resultDiv.innerHTML = `
    <div class="card">
      <div class="result-header">
        ${sourceBadge}
        ${trustBadge}
        ${confidenceBadge}
        ${customBadge}
      </div>

      ${untrustedBanner}

      <div class="intent">
        ✨ ${escapeHtml(result.intent)}
      </div>

      <!-- Tab Navigation -->
      <div class="tabs">
        <button class="tab active" data-tab="human">Human Readable</button>
        <button class="tab" data-tab="json">JSON Response</button>
        <button class="tab" data-tab="code">Code Snippet</button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content active" id="tab-human">
        <div class="fields">
          <div class="field">
            <span class="field-label">source</span>
            <span class="field-value">${escapeHtml(result.source)}</span>
          </div>
          <div class="field">
            <span class="field-label">trust.accepted</span>
            <span class="field-value">${escapeHtml(trust.label)}</span>
          </div>
          ${fieldsHtml}
          <div class="field">
            <span class="field-label">Contract</span>
            <span class="field-value">${escapeHtml(result.metadata.contractAddress)}</span>
          </div>
          <div class="field">
            <span class="field-label">Function</span>
            <span class="field-value">${escapeHtml(result.signature)}</span>
          </div>
        </div>
        ${warningsHtml}
        <p class="trust-note">${escapeHtml(trust.note)}</p>
      </div>

      <div class="tab-content" id="tab-json">
        <div class="code-block-header">
          <span>Response JSON</span>
          <button class="copy-btn" data-copy="json">Copy</button>
        </div>
        <pre class="code-block" id="json-output">${escapeHtml(JSON.stringify(jsonOutput, replacer, 2))}</pre>
      </div>

      <div class="tab-content" id="tab-code">
        <div class="code-block-header">
          <span>TypeScript / JavaScript</span>
          <button class="copy-btn" data-copy="code">Copy</button>
        </div>
        <pre class="code-block" id="code-output">${escapeHtml(codeSnippet)}</pre>
        <p class="code-note">
          Install the SDK: <code>npm install @erc7730/sdk</code>
        </p>
      </div>
    </div>
  `;

  // Setup tab switching
  resultDiv.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabId = (tab as HTMLElement).dataset.tab;
      if (!tabId) return;

      resultDiv.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      resultDiv.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      resultDiv.querySelector(`#tab-${tabId}`)?.classList.add('active');
    });
  });

  // Setup copy buttons
  setupCopyButtons(resultDiv, jsonOutput, codeSnippet);

  resultDiv.style.display = 'block';
}

function renderGenerateResult(descriptor: ERC7730Descriptor, fromSourcify = false) {
  const functionCount = Object.keys(descriptor.display.formats).length;
  const functions = Object.keys(descriptor.display.formats);
  const trust = getTrustDisplay('generated', true);

  const sourcifyBadge = fromSourcify
    ? '<span class="badge badge-warning">source: sourcify</span>'
    : '';

  const untrustedBanner = `<div class="untrusted-banner">
        <span>This is an ABI-generated draft. Untrusted fallback — never confidence: "high". Curated metadata belongs in the <a href="https://github.com/ethereum/clear-signing-erc7730-registry" target="_blank" rel="noreferrer">official registry</a>, not this repo.</span>
      </div>`;

  generateResultDiv.innerHTML = `
    <div class="card">
      <div class="result-header">
        <span class="badge badge-warning">Untrusted draft</span>
        <span class="badge badge-warning">trust.accepted: false</span>
        ${sourcifyBadge}
        <span class="badge" style="background: var(--bg-tertiary); color: var(--text-muted);">
          ${functionCount} function${functionCount !== 1 ? 's' : ''}
        </span>
      </div>

      ${untrustedBanner}

      <div class="intent">
        📋 ${escapeHtml(descriptor.metadata?.owner || 'Custom')} Descriptor
      </div>

      <!-- Tab Navigation -->
      <div class="tabs">
        <button class="tab active" data-tab="gen-overview">Overview</button>
        <button class="tab" data-tab="gen-json">JSON Descriptor</button>
        <button class="tab" data-tab="gen-code">Usage Code</button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content active" id="tab-gen-overview">
        <div class="fields">
          <div class="field">
            <span class="field-label">source</span>
            <span class="field-value">${fromSourcify ? 'sourcify' : 'generated'}</span>
          </div>
          <div class="field">
            <span class="field-label">trust.accepted</span>
            <span class="field-value">${escapeHtml(trust.label)}</span>
          </div>
          <div class="field">
            <span class="field-label">Schema</span>
            <span class="field-value">${escapeHtml(descriptor.$schema || 'ERC-7730')}</span>
          </div>
          <div class="field">
            <span class="field-label">Contract</span>
            <span class="field-value">${escapeHtml(descriptor.context.contract?.deployments?.[0]?.address || 'N/A')}</span>
          </div>
          <div class="field">
            <span class="field-label">Chain ID</span>
            <span class="field-value">${descriptor.context.contract?.deployments?.[0]?.chainId || 'N/A'}</span>
          </div>
          <div class="field">
            <span class="field-label">Functions</span>
            <span class="field-value">${functions.map((f) => f.split('(')[0]).join(', ')}</span>
          </div>
        </div>
        <p class="trust-note">${escapeHtml(trust.note)}</p>
        <p class="help-text">
          Optional: propose a <em>reviewed</em> file on the
          <button class="contribute-btn" id="contribute-generated-btn" type="button">official registry</button>
          — never on this SDK repo.
        </p>
      </div>

      <div class="tab-content" id="tab-gen-json">
        <div class="code-block-header">
          <span>ERC-7730 Descriptor</span>
          <button class="copy-btn" data-copy="gen-json">Copy</button>
        </div>
        <pre class="code-block" id="gen-json-output">${escapeHtml(JSON.stringify(descriptor, replacer, 2))}</pre>
      </div>

      <div class="tab-content" id="tab-gen-code">
        <div class="code-block-header">
          <span>TypeScript / JavaScript</span>
          <button class="copy-btn" data-copy="gen-code">Copy</button>
        </div>
        <pre class="code-block" id="gen-code-output">${escapeHtml(generateDescriptorUsageCode(descriptor))}</pre>
        <p class="code-note">
          Install the SDK: <code>npm install @erc7730/sdk</code>
        </p>
      </div>
    </div>
  `;

  // Setup tab switching
  generateResultDiv.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabId = (tab as HTMLElement).dataset.tab;
      if (!tabId) return;

      generateResultDiv.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      generateResultDiv
        .querySelectorAll('.tab-content')
        .forEach((c) => c.classList.remove('active'));
      generateResultDiv.querySelector(`#tab-${tabId}`)?.classList.add('active');
    });
  });

  // Setup copy buttons
  const descriptorJson = JSON.stringify(descriptor, replacer, 2);
  const usageCode = generateDescriptorUsageCode(descriptor);

  generateResultDiv.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const copyType = (btn as HTMLElement).dataset.copy;
      let textToCopy = '';

      if (copyType === 'gen-json') {
        textToCopy = descriptorJson;
      } else if (copyType === 'gen-code') {
        textToCopy = usageCode;
      }

      await copyToClipboard(btn as HTMLButtonElement, textToCopy);
    });
  });

  // Setup contribute button
  generateResultDiv.querySelector('#contribute-generated-btn')?.addEventListener('click', () => {
    showContributePopup(descriptor);
  });

  // Show "Use for Decoding" button
  useForDecodeBtn.style.display = 'block';

  generateResultDiv.style.display = 'block';
}

function generateDescriptorUsageCode(descriptor: ERC7730Descriptor): string {
  return `import { ClearSigner, generateDescriptor } from '@erc7730/sdk';

// Generated / Sourcify drafts are untrusted — never confidence: "high".
// Option 1: local override (not a registry contribution)
const descriptor = ${JSON.stringify(descriptor, replacer, 2)};

const signer = new ClearSigner();
signer.extend([descriptor]);

// Option 2: Generate at runtime from ABI
const runtimeDescriptor = generateDescriptor({
  chainId: ${descriptor.context.contract?.deployments?.[0]?.chainId || 1},
  address: '${descriptor.context.contract?.deployments?.[0]?.address || '0x...'}',
  abi: yourContractABI,
  owner: '${descriptor.metadata?.owner || 'My Protocol'}',
});

signer.extend([runtimeDescriptor]);

// Now decode transactions
const result = await signer.decode({
  to: '${descriptor.context.contract?.deployments?.[0]?.address || '0x...'}',
  data: '0x...',
  chainId: ${descriptor.context.contract?.deployments?.[0]?.chainId || 1},
});`;
}

// ============================================================================
// Helper Functions
// ============================================================================
function setupCopyButtons(container: HTMLElement, jsonOutput: object, codeSnippet: string) {
  container.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const copyType = (btn as HTMLElement).dataset.copy;
      let textToCopy = '';

      if (copyType === 'json') {
        textToCopy = JSON.stringify(jsonOutput, replacer, 2);
      } else if (copyType === 'code') {
        textToCopy = codeSnippet;
      }

      await copyToClipboard(btn as HTMLButtonElement, textToCopy);
    });
  });
}

async function copyToClipboard(btn: HTMLButtonElement, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function showError(message: string) {
  resultDiv.innerHTML = `
    <div class="error-message">
      ${escapeHtml(message)}
    </div>
  `;
  resultDiv.style.display = 'block';
}

function showGenerateError(message: string) {
  generateResultDiv.innerHTML = `
    <div class="error-message">
      ${escapeHtml(message)}
    </div>
  `;
  generateResultDiv.style.display = 'block';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Handle BigInt serialization
function replacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

// Allow decode on Enter key
calldataInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    decodeBtn.click();
  }
});
