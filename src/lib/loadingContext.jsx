import React, { createContext, useContext, useState, useCallback, useRef } from "react";

/**
 * Contexto global de carga con conteo de operaciones concurrentes.
 * Permite mostrar/ocultar un overlay de carga a pantalla completa
 * desde cualquier componente de la app.
 *
 * El conteo evita que una operación que termina oculte el overlay
 * mientras otra aún está en curso.
 *
 * Uso:
 *   const { showLoading, hideLoading } = useLoading();
 *   showLoading("Consultando registros...");
 *   await fetchData();
 *   hideLoading();
 */
const LoadingContext = createContext(null);

export const useLoading = () => {
  const ctx = useContext(LoadingContext);
  if (!ctx) return { showLoading: () => {}, hideLoading: () => {}, updateLoadingMessage: () => {}, isLoading: false, message: "" };
  return ctx;
};

export const LoadingProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("Cargando información, espere...");
  const countRef = useRef(0);

  const showLoading = useCallback((msg) => {
    if (msg) setMessage(msg);
    countRef.current += 1;
    if (countRef.current === 1) setIsLoading(true);
  }, []);

  const updateLoadingMessage = useCallback((msg) => {
    if (msg) setMessage(msg);
  }, []);

  const hideLoading = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    if (countRef.current === 0) setIsLoading(false);
  }, []);

  return (
    <LoadingContext.Provider value={{ showLoading, hideLoading, updateLoadingMessage, isLoading, message }}>
      {children}
    </LoadingContext.Provider>
  );
};