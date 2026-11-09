const baseUrl = (process.env.REVIEWS_GATEWAY_E2E_BASE_URL ?? '').replace(/\/$/u, '');
const propertyId = process.env.REVIEWS_GATEWAY_E2E_PROPERTY_ID ?? '';
const serviceToken = process.env.REVIEWS_GATEWAY_E2E_SERVICE_TOKEN ?? '';
const enabled = baseUrl.length > 0 && propertyId.length > 0;
const describeReal = enabled ? describe : describe.skip;

describeReal('gateway to reviews public route', () => {
  it('returns a public ReviewPage without private identifiers', async () => {
    const response = await fetch(
      `${baseUrl}/properties/${propertyId}/reviews?page=1&pageSize=20`,
      serviceToken ? { headers: { authorization: `Bearer ${serviceToken}` } } : {},
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toMatchObject({ page: 1, pageSize: 20 });

    for (const item of body.items as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty('guestId');
      expect(item).not.toHaveProperty('bookingId');
    }
  });
});
