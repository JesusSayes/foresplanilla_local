export const buildFilterQuery = (baseQuery, filters = {}, params = []) => {
  let query = baseQuery;
  const conditions = [];
  let paramIndex = params.length + 1;

  // Asegurar que filters sea siempre un objeto
  const safeFilters =
    filters && typeof filters === 'object'
      ? filters
      : {};

  Object.entries(safeFilters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      conditions.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  });

  if (conditions.length > 0) {
    query += (query.includes('WHERE') ? ' AND ' : ' WHERE ') + conditions.join(' AND ');
  }

  return { query, params };
};

export const buildSortQuery = (query, sortField) => {
  if (!sortField) return query;

  const isDescending = sortField.startsWith('-');
  const field = isDescending ? sortField.substring(1) : sortField;
  const direction = isDescending ? 'DESC' : 'ASC';

  return `${query} ORDER BY ${field} ${direction}`;
};

export const buildPaginationQuery = (query, page = 1, limit = 100) => {
  const offset = (page - 1) * limit;
  return `${query} LIMIT ${limit} OFFSET ${offset}`;
};

export const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.trim();
  }
  return input;
};
