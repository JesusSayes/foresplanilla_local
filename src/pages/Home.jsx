import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Users, Calendar, Clock, FileText, Award, TrendingUp,
  ArrowRight, Shield, CheckCircle
} from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadEmployee = async () => {
      try {
        const user = await base44.auth.me();
        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading employee:", error);
      } finally {
        setLoading(false);
      }
    };

    loadEmployee();
  }, []);

  const getRoleText = (role) => {
    const roles = {
      "admin": "Administrador",
      "manager": "Manager",
      "empleado": "Empleado"
    };
    return roles[role] || "Usuario";
  };

  const features = [
    {
      icon: FileText,
      title: "Boletas de Pago",
      description: "Consulta y descarga tus boletas de remuneración",
      color: "bg-blue-500",
      link: "Payslips"
    },
    {
      icon: Calendar,
      title: "Gestión de Vacaciones",
      description: "Solicita y gestiona tus días de descanso",
      color: "bg-green-500",
      link: "VacationRequest"
    },
    {
      icon: Clock,
      title: "Control de Asistencia",
      description: "Visualiza tu registro de asistencia y horarios",
      color: "bg-purple-500",
      link: "Attendance"
    },
    {
      icon: Award,
      title: "Certificados",
      description: "Solicita certificados laborales y constancias",
      color: "bg-orange-500",
      link: "Certificates"
    },
    {
      icon: Users,
      title: "Mi Perfil",
      description: "Actualiza tu información personal",
      color: "bg-pink-500",
      link: "MyProfile"
    },
    {
      icon: TrendingUp,
      title: "Dashboard",
      description: "Vista general de tu información",
      color: "bg-indigo-500",
      link: "Dashboard"
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Portal RRHH</h1>
        </div>
        <Button
          variant="outline"
          className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20"
          onClick={() => base44.auth.logout()}
        >
          Cerrar Sesión
        </Button>
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-6 pt-32 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white mb-6">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">Sesión Iniciada</span>
          </div>
          
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Bienvenido{employee?.first_name ? `, ${employee.first_name}` : ""}
          </h2>
          
          {employee && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-2xl text-white/90">
                {employee.position}
              </p>
              <div className="flex items-center gap-3 text-white/80">
                <span>{employee.department_name}</span>
                <span>•</span>
                <span>{getRoleText(employee.role)}</span>
              </div>
            </div>
          )}

          <Button
            size="lg"
            className="mt-8 bg-white text-indigo-600 hover:bg-white/90 shadow-xl text-lg px-8 py-6"
            onClick={() => navigate(createPageUrl("Dashboard"))}
          >
            Ir al Dashboard
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h3 className="text-3xl font-bold text-white text-center mb-8">
            Acceso Rápido
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                >
                  <Card
                    className="group cursor-pointer border-0 bg-white/10 backdrop-blur-lg hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl"
                    onClick={() => navigate(createPageUrl(feature.link))}
                  >
                    <CardContent className="p-6">
                      <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      
                      <h4 className="text-xl font-bold text-white mb-2">
                        {feature.title}
                      </h4>
                      
                      <p className="text-white/70 text-sm mb-4">
                        {feature.description}
                      </p>
                      
                      <div className="flex items-center text-white font-medium text-sm group-hover:gap-2 transition-all">
                        Acceder
                        <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-6 text-center text-white/60 text-sm">
        <p>Sistema de Gestión de Recursos Humanos © 2025</p>
      </div>
    </div>
  );
}