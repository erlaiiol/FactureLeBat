import { ProductExtractionService } from './product-extraction.service';

describe('ProductExtractionService', () => {
  const service = new ProductExtractionService();
  const sourceUrl = 'https://supplier.example.com/product/parquet-oak';

  it('extracts name, description and price from JSON-LD schema.org Product markup', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Parquet chêne massif",
            "description": "Parquet en chêne massif, pose collée, 14mm.",
            "offers": { "@type": "Offer", "price": "45.00", "priceCurrency": "EUR" }
          }
        </script>
      </head><body></body></html>
    `;

    const draft = service.extract(html, sourceUrl);

    expect(draft.name).toBe('Parquet chêne massif');
    expect(draft.description).toBe('Parquet en chêne massif, pose collée, 14mm.');
    expect(draft.priceCents).toBe(4500);
    expect(draft.supplierUrl).toBe(sourceUrl);
  });

  it('reads price from an array of offers (first entry)', () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Product","name":"Colle carrelage","offers":[{"price":19.9},{"price":25}]}
      </script>
    `;

    expect(service.extract(html, sourceUrl).priceCents).toBe(1990);
  });

  it('finds a Product node nested inside an @graph array', () => {
    const html = `
      <script type="application/ld+json">
        {"@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Sous-couche isolante","offers":{"price":"12,50"}}]}
      </script>
    `;

    const draft = service.extract(html, sourceUrl);
    expect(draft.name).toBe('Sous-couche isolante');
    expect(draft.priceCents).toBe(1250);
  });

  it('falls back to Open Graph tags when there is no JSON-LD', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Parquet chêne massif (OG)" />
        <meta property="og:description" content="Description via Open Graph" />
        <meta property="og:site_name" content="Point P" />
        <meta property="product:price:amount" content="45.00" />
      </head><body></body></html>
    `;

    const draft = service.extract(html, sourceUrl);
    expect(draft.name).toBe('Parquet chêne massif (OG)');
    expect(draft.description).toBe('Description via Open Graph');
    expect(draft.supplierName).toBe('Point P');
    expect(draft.priceCents).toBe(4500);
  });

  it('falls back to <title> and the URL hostname when no structured data is present at all', () => {
    const html = `<html><head><title>Parquet oak - Supplier</title></head><body></body></html>`;

    const draft = service.extract(html, sourceUrl);
    expect(draft.name).toBe('Parquet oak - Supplier');
    expect(draft.supplierName).toBe('supplier.example.com');
    expect(draft.priceCents).toBeNull();
  });

  it('does not throw on malformed JSON-LD and falls back to Open Graph instead', () => {
    const html = `
      <script type="application/ld+json">{ this is not valid json }</script>
      <meta property="og:title" content="Fallback title" />
    `;

    expect(() => service.extract(html, sourceUrl)).not.toThrow();
    expect(service.extract(html, sourceUrl).name).toBe('Fallback title');
  });

  it.each([
    ['45.00', 4500],
    ['45,00 €', 4500],
    ['1 234,56 €', 123456],
    ['not a price', null],
  ])('parses price %s as %s cents', (rawPrice, expectedCents) => {
    const html = `<meta property="og:price:amount" content="${rawPrice}" />`;
    expect(service.extract(html, sourceUrl).priceCents).toBe(expectedCents);
  });

  it.each([
    ['Parquet 25.5 m² lot', 'm²'],
    ['Colle 5 kg', 'kg'],
    ['Sous-couche 10 m2', 'm²'],
    ['Vendu à l’unité', 'unité'],
    ['Rien de reconnaissable dans ce texte', null],
  ])('detects the unit from "%s" as %s', (text, expectedUnit) => {
    const html = `<title>${text}</title>`;
    expect(service.extract(html, sourceUrl).unit).toBe(expectedUnit);
  });

  it('strips HTML tags and clamps an oversized extracted field', () => {
    // Note: the payload must not contain a literal "</script>" substring —
    // that would end the surrounding HTML <script> element itself (per the
    // HTML5 raw-text parsing rules), not just the JSON string content.
    const longText = 'A'.repeat(3000);
    const html = `
      <script type="application/ld+json">
        {"@type":"Product","name":"<b>Parquet</b> <img src=x onerror=alert(1)>","description":"${longText}"}
      </script>
    `;

    const draft = service.extract(html, sourceUrl);
    expect(draft.name).not.toContain('<b>');
    expect(draft.name).not.toContain('<img');
    expect(draft.description?.length).toBeLessThanOrEqual(2000);
  });
});
