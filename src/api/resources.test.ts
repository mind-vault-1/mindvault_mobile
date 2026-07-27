import { buildQuery } from './resources';

describe('buildQuery', () => {
  it('returns empty string for empty filters or undefined', () => {
    expect(buildQuery()).toBe('');
    expect(buildQuery({})).toBe('');
  });

  it('includes search query when provided', () => {
    expect(buildQuery({ search: 'test' })).toBe('?search=test');
    expect(buildQuery({ search: 'hello world' })).toBe('?search=hello+world');
  });

  it('includes verificationStatus when it is not "all"', () => {
    expect(buildQuery({ verificationStatus: 'verified' })).toBe('?verificationStatus=verified');
    expect(buildQuery({ verificationStatus: 'all' })).toBe('');
  });

  it('includes resourceType when it is not "all"', () => {
    expect(buildQuery({ resourceType: 'file' as any })).toBe('?resourceType=file');
    expect(buildQuery({ resourceType: 'all' })).toBe('');
  });

  it('combines multiple filters correctly', () => {
    const filters: any = {
      search: 'ai',
      verificationStatus: 'verified',
      resourceType: 'file'
    };
    const query = buildQuery(filters);
    expect(query).toContain('search=ai');
    expect(query).toContain('verificationStatus=verified');
    expect(query).toContain('resourceType=file');
    expect(query.startsWith('?')).toBe(true);
  });

  it('ignores extra properties not in CatalogFilters', () => {
    const filters: any = {
      search: 'test',
      minPrice: '1.00',
      maxPrice: '10.00',
    };
    expect(buildQuery(filters)).toBe('?search=test');
  });

  it('omits search when it is empty string', () => {
    expect(buildQuery({ search: '' })).toBe('');
  });
});
