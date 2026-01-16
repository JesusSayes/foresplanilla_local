import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const navigate = useNavigate();
  const { login, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        navigate("/Dashboard");
      } else {
        setError(result.error || "Error al iniciar sesión");
      }
    } catch (err) {
      setError("Error de conexión. Verifica que el servidor esté corriendo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a5850] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-lg">
          <CardContent className="p-10">
            <div className="text-center mb-8">
              <div className="mx-auto mb-6">
                <img
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6947a46a4a533fe8f1a3a057/dc4db427e_image.png"
                  alt="PAMA Logo"
                  className="h-24 mx-auto"
                />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                Portal RRHH
              </h1>
              <p className="text-slate-600">
                Sistema de Gestión de Recursos Humanos
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full"
                />
              </div>

              {(error || authError) && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error || authError}</span>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="w-full bg-[#1a5850] hover:bg-[#0f3d37] text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 text-lg py-6"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    Iniciar Sesión
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-slate-500">
                Accede con tus credenciales corporativas
              </p>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-center gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-[#1a5850]" />
                  Seguro
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-[#1a5850]" />
                  Rápido
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-[#1a5850]" />
                  Confiable
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-white/80 text-sm mt-6">
          © 2025 Sistema de Gestión RRHH
        </p>
      </motion.div>
    </div>
  );
}
