export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateDNI = (dni) => {
  return /^\d{8}$/.test(dni);
};

export const validateRUC = (ruc) => {
  return /^\d{11}$/.test(ruc);
};

export const validateDate = (date) => {
  const dateObj = new Date(date);
  return dateObj instanceof Date && !isNaN(dateObj);
};

export const validateRequired = (fields, data) => {
  const missing = [];
  fields.forEach(field => {
    if (!data[field] || data[field] === '') {
      missing.push(field);
    }
  });
  return missing;
};
