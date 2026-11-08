export const MOCK_GATEWAY_TOKENS = {
  approved: 'tok_approved',
  declinedFunds: 'tok_declined_funds',
  declinedFraud: 'tok_declined_fraud',
  gatewayTimeout: 'tok_gateway_timeout',
  gatewayDown: 'tok_gateway_down',
  refundFails: 'tok_refund_fails',
} as const;

export const TEST_TOKEN_HMAC_SECRET = 'payments-fixture-secret-with-more-than-32-characters';
