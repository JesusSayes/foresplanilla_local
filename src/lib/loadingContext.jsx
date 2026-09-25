import React, { createContext, useContext, useState, useCallback } from "react";

/**
 * Contexto global de carga. Permite mostrar/ocultar un overlay de carga
 * a pantalla completa desde cualquier componente de la app.
 *
 * Uso:
 *   const { showLoading, hideLoading } = useLoading();
 *   showLoading("Consultando registros...");
 *   await fetchData();
 *   hideLoading();
 *
 * El overlay se renderiza una sola vez en el LoadingProvider.
 */
const LoadingContext = createContext(null);

export const useLoading = () => {
  const ctx = useContext(LoadingContext);
  if (!ctx) return { showLoading: () => {}, hideLoading: () => {}, isLoading: false, message: "" };
  return ctx;
};

export const LoadingProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("Cargando información, espere...");

  const showLoading = useCallback((msg) => {
    if (msg) setMessage(msg);
    setIsLoading(true);
  }, []);

  const hideLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <LoadingContext.Provider value={{ showLoading, hideLoading, isLoading, message }}>
      {children}
    </LoadingContext.Provider>
  );
};