/**
 * Infer human-readable intent from function name
 */

interface IntentPattern {
  keywords: string[];
  intent: string;
  priority: number; // Higher = more specific, checked first
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Compound patterns (more specific, higher priority)
  { keywords: ['swap', 'exact', 'input'], intent: 'Swap exact input amount', priority: 10 },
  { keywords: ['swap', 'exact', 'output'], intent: 'Swap for exact output amount', priority: 10 },
  { keywords: ['add', 'liquidity'], intent: 'Add liquidity', priority: 10 },
  { keywords: ['remove', 'liquidity'], intent: 'Remove liquidity', priority: 10 },
  { keywords: ['claim', 'reward'], intent: 'Claim rewards', priority: 10 },
  { keywords: ['claim', 'fee'], intent: 'Claim fees', priority: 10 },
  { keywords: ['set', 'approval', 'all'], intent: 'Set approval for all', priority: 10 },
  { keywords: ['safe', 'transfer'], intent: 'Safe transfer', priority: 10 },
  { keywords: ['batch', 'transfer'], intent: 'Batch transfer', priority: 10 },
  { keywords: ['flash', 'loan'], intent: 'Flash loan', priority: 10 },
  { keywords: ['increase', 'allowance'], intent: 'Increase allowance', priority: 10 },
  { keywords: ['decrease', 'allowance'], intent: 'Decrease allowance', priority: 10 },
  { keywords: ['permit', 'transfer'], intent: 'Permit and transfer', priority: 10 },

  // Single keyword patterns (lower priority)
  { keywords: ['transfer'], intent: 'Transfer', priority: 5 },
  { keywords: ['approve'], intent: 'Approve spending', priority: 5 },
  { keywords: ['swap'], intent: 'Swap tokens', priority: 5 },
  { keywords: ['deposit'], intent: 'Deposit', priority: 5 },
  { keywords: ['withdraw'], intent: 'Withdraw', priority: 5 },
  { keywords: ['unstake'], intent: 'Unstake', priority: 6 },
  { keywords: ['stake'], intent: 'Stake', priority: 5 },
  { keywords: ['claim'], intent: 'Claim', priority: 5 },
  { keywords: ['mint'], intent: 'Mint', priority: 5 },
  { keywords: ['burn'], intent: 'Burn', priority: 5 },
  { keywords: ['redeem'], intent: 'Redeem', priority: 5 },
  { keywords: ['borrow'], intent: 'Borrow', priority: 5 },
  { keywords: ['repay'], intent: 'Repay', priority: 5 },
  { keywords: ['supply'], intent: 'Supply', priority: 5 },
  { keywords: ['execute'], intent: 'Execute', priority: 5 },
  { keywords: ['multicall'], intent: 'Multiple calls', priority: 5 },
  { keywords: ['delegate'], intent: 'Delegate', priority: 5 },
  { keywords: ['vote'], intent: 'Vote', priority: 5 },
  { keywords: ['revoke'], intent: 'Revoke', priority: 5 },
  { keywords: ['cancel'], intent: 'Cancel', priority: 5 },
  { keywords: ['update'], intent: 'Update', priority: 5 },
  { keywords: ['set'], intent: 'Configure', priority: 3 },
  { keywords: ['get'], intent: 'Query', priority: 3 },
  { keywords: ['create'], intent: 'Create', priority: 5 },
  { keywords: ['destroy'], intent: 'Destroy', priority: 5 },
  { keywords: ['initialize'], intent: 'Initialize', priority: 5 },
  { keywords: ['upgrade'], intent: 'Upgrade', priority: 5 },
  { keywords: ['pause'], intent: 'Pause', priority: 5 },
  { keywords: ['unpause'], intent: 'Unpause', priority: 5 },
  { keywords: ['lock'], intent: 'Lock', priority: 5 },
  { keywords: ['unlock'], intent: 'Unlock', priority: 5 },
  { keywords: ['wrap'], intent: 'Wrap', priority: 5 },
  { keywords: ['unwrap'], intent: 'Unwrap', priority: 5 },
  { keywords: ['bridge'], intent: 'Bridge', priority: 5 },
  { keywords: ['permit'], intent: 'Permit', priority: 5 },
  { keywords: ['collect'], intent: 'Collect', priority: 5 },
  { keywords: ['harvest'], intent: 'Harvest', priority: 5 },
  { keywords: ['compound'], intent: 'Compound', priority: 5 },
  { keywords: ['liquidate'], intent: 'Liquidate', priority: 5 },
  { keywords: ['settle'], intent: 'Settle', priority: 5 },
  { keywords: ['fill'], intent: 'Fill order', priority: 5 },
  { keywords: ['order'], intent: 'Place order', priority: 4 },
  { keywords: ['register'], intent: 'Register', priority: 5 },
  { keywords: ['renew'], intent: 'Renew', priority: 5 },
];

/**
 * Infer intent from function name
 */
export function inferIntent(functionName: string): string {
  if (!functionName) {
    return 'Contract interaction';
  }

  const lowerName = functionName.toLowerCase();

  // Sort patterns by priority (descending)
  const sortedPatterns = [...INTENT_PATTERNS].sort((a, b) => b.priority - a.priority);

  // Find matching pattern
  for (const pattern of sortedPatterns) {
    const allKeywordsMatch = pattern.keywords.every((kw) => lowerName.includes(kw.toLowerCase()));
    if (allKeywordsMatch) {
      return pattern.intent;
    }
  }

  // Fallback: capitalize function name
  return formatFunctionName(functionName);
}

/**
 * Format function name as readable text
 */
function formatFunctionName(name: string): string {
  // Convert camelCase to Title Case
  const spaced = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  return spaced;
}
