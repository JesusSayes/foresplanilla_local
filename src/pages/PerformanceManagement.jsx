import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Target, Star, TrendingUp, Users, Plus, Edit, Eye, 
  CheckCircle, Clock, AlertCircle, Search
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function PerformanceManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [activeTab, setActiveTab] = useState("goals");
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [editingReview, setEditingReview] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [goalFormData, setGoalFormData] = useState({});
  const [reviewFormData, setReviewFormData] = useState({});

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);

        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };

    loadUserData();
  }, []);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => await base44.entities.Employee.filter({ status: "Activo" }),
  });

  const { data: allGoals = [] } = useQuery({
    queryKey: ["performanceGoals"],
    queryFn: async () => await base44.entities.PerformanceGoal.list("-created_date"),
  });

  const { data: allReviews = [] } = useQuery({
    queryKey: ["performanceReviews"],
    queryFn: async () => await base44.entities.PerformanceReview.list("-review_date"),
  });

  const createGoalMutation = useMutation({
    mutationFn: async (data) => await base44.entities.PerformanceGoal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(["performanceGoals"]);
      toast.success("Objetivo creado exitosamente");
      resetGoalForm();
    },
    onError: () => toast.error("Error al crear el objetivo"),
  });

  const updateGoalMutation = useMutation({
    mutationFn: async ({ id, data }) => await base44.entities.PerformanceGoal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["performanceGoals"]);
      toast.success("Objetivo actualizado exitosamente");
      resetGoalForm();
    },
    onError: () => toast.error("Error al actualizar el objetivo"),
  });

  const createReviewMutation = useMutation({
    mutationFn: async (data) => await base44.entities.PerformanceReview.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(["performanceReviews"]);
      toast.success("Evaluación creada exitosamente");
      resetReviewForm();
    },
    onError: () => toast.error("Error al crear la evaluación"),
  });

  const updateReviewMutation = useMutation({
    mutationFn: async ({ id, data }) => await base44.entities.PerformanceReview.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["performanceReviews"]);
      toast.success("Evaluación actualizada exitosamente");
      resetReviewForm();
    },
    onError: () => toast.error("Error al actualizar la evaluación"),
  });

  const handleCreateGoal = () => {
    setEditingGoal(null);
    setGoalFormData({
      status: "Pendiente",
      priority: "Media",
      category: "Productividad",
      current_value: 0,
    });
    setShowGoalForm(true);
  };

  const handleEditGoal = (goal) => {
    setEditingGoal(goal);
    setGoalFormData(goal);
    setShowGoalForm(true);
  };

  const handleSubmitGoal = () => {
    if (!goalFormData.employee_id || !goalFormData.title || !goalFormData.start_date || !goalFormData.due_date) {
      toast.error("Completa los campos requeridos");
      return;
    }

    const data = {
      ...goalFormData,
      assigned_by: currentUser.email,
    };

    if (editingGoal) {
      updateGoalMutation.mutate({ id: editingGoal.id, data });
    } else {
      createGoalMutation.mutate(data);
    }
  };

  const resetGoalForm = () => {
    setGoalFormData({});
    setEditingGoal(null);
    setShowGoalForm(false);
  };

  const handleCreateReview = (empId = null) => {
    setEditingReview(null);
    setReviewFormData({
      employee_id: empId,
      review_date: format(new Date(), "yyyy-MM-dd"),
      review_type: "Trimestral",
      status: "Pendiente Autoevaluación",
    });
    setShowReviewForm(true);
  };

  const handleEditReview = (review) => {
    setEditingReview(review);
    setReviewFormData(review);
    setShowReviewForm(true);
  };

  const handleSubmitReview = () => {
    if (!reviewFormData.employee_id || !reviewFormData.review_period) {
      toast.error("Completa los campos requeridos");
      return;
    }

    const data = {
      ...reviewFormData,
      reviewed_by: currentUser.email,
    };

    if (editingReview) {
      updateReviewMutation.mutate({ id: editingReview.id, data });
    } else {
      createReviewMutation.mutate(data);
    }
  };

  const resetReviewForm = () => {
    setReviewFormData({});
    setEditingReview(null);
    setShowReviewForm(false);
  };

  const filteredEmployees = allEmployees.filter(emp => 
    emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getGoalStatusConfig = (status) => {
    const configs = {
      "Pendiente": { color: "bg-slate-100 text-slate-700", icon: Clock },
      "En Progreso": { color: "bg-blue-100 text-blue-700", icon: TrendingUp },
      "Completado": { color: "bg-green-100 text-green-700", icon: CheckCircle },
      "Cancelado": { color: "bg-red-100 text-red-700", icon: AlertCircle },
    };
    return configs[status] || configs["Pendiente"];
  };

  const calculateProgress = (goal) => {
    if (!goal.target_value || goal.target_value === 0) return 0;
    return Math.min((goal.current_value / goal.target_value) * 100, 100);
  };

  const stats = {
    totalGoals: allGoals.length,
    activeGoals: allGoals.filter(g => g.status === "En Progreso" || g.status === "Pendiente").length,
    completedGoals: allGoals.filter(g => g.status === "Completado").length,
    pendingReviews: allReviews.filter(r => r.status !== "Completada").length,
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (employee.role !== "admin" && employee.role !== "manager") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores y managers pueden gestionar desempeño</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Gestión de Desempeño
          </h1>
          <p className="text-slate-600 text-lg">
            Administra objetivos y evaluaciones de desempeño
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Target className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.totalGoals}
              </div>
              <p className="text-slate-600 text-sm">Total Objetivos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.activeGoals}
              </div>
              <p className="text-slate-600 text-sm">Objetivos Activos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.completedGoals}
              </div>
              <p className="text-slate-600 text-sm">Objetivos Completados</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-amber-100 rounded-xl">
                  <Star className="w-6 h-6 text-amber-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.pendingReviews}
              </div>
              <p className="text-slate-600 text-sm">Evaluaciones Pendientes</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="goals">Objetivos</TabsTrigger>
            <TabsTrigger value="reviews">Evaluaciones</TabsTrigger>
            <TabsTrigger value="employees">Por Empleado</TabsTrigger>
          </TabsList>

          <TabsContent value="goals" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Objetivos de Desempeño</CardTitle>
                  <Button
                    onClick={handleCreateGoal}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Objetivo
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {allGoals.map(goal => {
                    const emp = allEmployees.find(e => e.id === goal.employee_id);
                    if (!emp) return null;
                    const StatusIcon = getGoalStatusConfig(goal.status).icon;
                    const progress = calculateProgress(goal);
                    const daysLeft = goal.due_date ? differenceInDays(new Date(goal.due_date), new Date()) : 0;

                    return (
                      <div key={goal.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-bold text-slate-900">{goal.title}</h4>
                              <Badge className={getGoalStatusConfig(goal.status).color}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {goal.status}
                              </Badge>
                              <Badge className={
                                goal.priority === "Crítica" ? "bg-red-100 text-red-700" :
                                goal.priority === "Alta" ? "bg-orange-100 text-orange-700" :
                                goal.priority === "Media" ? "bg-blue-100 text-blue-700" :
                                "bg-slate-100 text-slate-700"
                              }>
                                {goal.priority}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600 mb-2">
                              {emp.first_name} {emp.last_name} - {emp.department_name}
                            </p>
                            {goal.description && (
                              <p className="text-sm text-slate-600 mb-3">{goal.description}</p>
                            )}
                            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                              <div>
                                <p className="text-slate-600">Categoría</p>
                                <p className="font-semibold">{goal.category}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Progreso</p>
                                <p className="font-semibold">{goal.current_value || 0} / {goal.target_value} {goal.unit}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Fecha Límite</p>
                                <p className={`font-semibold ${daysLeft < 7 && daysLeft >= 0 ? 'text-amber-600' : daysLeft < 0 ? 'text-red-600' : ''}`}>
                                  {format(new Date(goal.due_date), 'dd/MM/yyyy')}
                                  {daysLeft >= 0 && ` (${daysLeft}d)`}
                                </p>
                              </div>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div 
                                className="bg-indigo-600 h-2 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-slate-600 mt-1">{progress.toFixed(1)}% completado</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditGoal(goal)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Evaluaciones de Desempeño</CardTitle>
                  <Button
                    onClick={() => handleCreateReview()}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Evaluación
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {allReviews.map(review => {
                    const emp = allEmployees.find(e => e.id === review.employee_id);
                    if (!emp) return null;

                    const avgSelf = review.self_assessment_productivity ? 
                      ((review.self_assessment_productivity + review.self_assessment_quality + 
                        review.self_assessment_teamwork + review.self_assessment_leadership + 
                        review.self_assessment_initiative) / 5).toFixed(1) : null;
                    
                    const avgManager = review.manager_assessment_productivity ? 
                      ((review.manager_assessment_productivity + review.manager_assessment_quality + 
                        review.manager_assessment_teamwork + review.manager_assessment_leadership + 
                        review.manager_assessment_initiative) / 5).toFixed(1) : null;

                    return (
                      <div key={review.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-bold text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </h4>
                              <Badge className={
                                review.status === "Completada" ? "bg-green-100 text-green-700" :
                                review.status === "Pendiente Manager" ? "bg-blue-100 text-blue-700" :
                                "bg-yellow-100 text-yellow-700"
                              }>
                                {review.status}
                              </Badge>
                              <Badge className="bg-purple-100 text-purple-700">
                                {review.review_type}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600 mb-3">
                              {review.review_period} - {format(new Date(review.review_date), 'dd/MM/yyyy')}
                            </p>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-slate-600">Autoevaluación</p>
                                <p className="font-bold text-blue-600 text-lg">
                                  {avgSelf ? `${avgSelf}/5` : "Pendiente"}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-600">Evaluación Manager</p>
                                <p className="font-bold text-indigo-600 text-lg">
                                  {avgManager ? `${avgManager}/5` : "Pendiente"}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-600">Calificación Final</p>
                                <p className="font-bold text-slate-900">
                                  {review.overall_rating || "Pendiente"}
                                </p>
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditReview(review)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="employees" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">Desempeño por Empleado</CardTitle>
                <div className="mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="Buscar empleado..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {filteredEmployees.map(emp => {
                    const empGoals = allGoals.filter(g => g.employee_id === emp.id);
                    const empReviews = allReviews.filter(r => r.employee_id === emp.id);
                    const activeGoals = empGoals.filter(g => g.status === "En Progreso" || g.status === "Pendiente").length;
                    const completedGoals = empGoals.filter(g => g.status === "Completado").length;
                    const latestReview = empReviews[0];

                    return (
                      <div key={emp.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-bold text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </h4>
                              <span className="text-sm text-slate-600">
                                {emp.position} - {emp.department_name}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-4 text-sm mt-3">
                              <div>
                                <p className="text-slate-600">Objetivos Activos</p>
                                <p className="font-bold text-blue-600 text-lg">{activeGoals}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Completados</p>
                                <p className="font-bold text-green-600 text-lg">{completedGoals}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Evaluaciones</p>
                                <p className="font-bold text-purple-600 text-lg">{empReviews.length}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Última Evaluación</p>
                                <p className="font-semibold text-slate-900">
                                  {latestReview ? format(new Date(latestReview.review_date), 'MMM yyyy', { locale: es }) : "N/A"}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedEmployee(emp);
                                handleCreateGoal();
                                setGoalFormData(prev => ({ ...prev, employee_id: emp.id }));
                              }}
                            >
                              <Target className="w-4 h-4 mr-1" />
                              Objetivo
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCreateReview(emp.id)}
                            >
                              <Star className="w-4 h-4 mr-1" />
                              Evaluar
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Goal Form Modal */}
      {showGoalForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
          onClick={resetGoalForm}
        >
          <Card className="max-w-2xl w-full my-8" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingGoal ? "Editar Objetivo" : "Nuevo Objetivo"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetGoalForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label>Empleado *</Label>
                <Select 
                  value={goalFormData.employee_id || ""} 
                  onValueChange={(val) => setGoalFormData({ ...goalFormData, employee_id: val })}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
                  <SelectContent>
                    {allEmployees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} - {emp.position}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Título del Objetivo *</Label>
                <Input
                  value={goalFormData.title || ""}
                  onChange={(e) => setGoalFormData({ ...goalFormData, title: e.target.value })}
                  placeholder="Ej: Aumentar ventas en 20%"
                />
              </div>

              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={goalFormData.description || ""}
                  onChange={(e) => setGoalFormData({ ...goalFormData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Categoría</Label>
                  <Select 
                    value={goalFormData.category || "Productividad"} 
                    onValueChange={(val) => setGoalFormData({ ...goalFormData, category: val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Productividad">Productividad</SelectItem>
                      <SelectItem value="Calidad">Calidad</SelectItem>
                      <SelectItem value="Trabajo en Equipo">Trabajo en Equipo</SelectItem>
                      <SelectItem value="Liderazgo">Liderazgo</SelectItem>
                      <SelectItem value="Desarrollo Profesional">Desarrollo Profesional</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prioridad</Label>
                  <Select 
                    value={goalFormData.priority || "Media"} 
                    onValueChange={(val) => setGoalFormData({ ...goalFormData, priority: val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Baja">Baja</SelectItem>
                      <SelectItem value="Media">Media</SelectItem>
                      <SelectItem value="Alta">Alta</SelectItem>
                      <SelectItem value="Crítica">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Valor Objetivo</Label>
                  <Input
                    type="number"
                    value={goalFormData.target_value || ""}
                    onChange={(e) => setGoalFormData({ ...goalFormData, target_value: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Valor Actual</Label>
                  <Input
                    type="number"
                    value={goalFormData.current_value || 0}
                    onChange={(e) => setGoalFormData({ ...goalFormData, current_value: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Unidad</Label>
                  <Input
                    value={goalFormData.unit || ""}
                    onChange={(e) => setGoalFormData({ ...goalFormData, unit: e.target.value })}
                    placeholder="%, unidades, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fecha Inicio *</Label>
                  <Input
                    type="date"
                    value={goalFormData.start_date || ""}
                    onChange={(e) => setGoalFormData({ ...goalFormData, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fecha Límite *</Label>
                  <Input
                    type="date"
                    value={goalFormData.due_date || ""}
                    onChange={(e) => setGoalFormData({ ...goalFormData, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Estado</Label>
                <Select 
                  value={goalFormData.status || "Pendiente"} 
                  onValueChange={(val) => setGoalFormData({ ...goalFormData, status: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="En Progreso">En Progreso</SelectItem>
                    <SelectItem value="Completado">Completado</SelectItem>
                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notas</Label>
                <Textarea
                  value={goalFormData.notes || ""}
                  onChange={(e) => setGoalFormData({ ...goalFormData, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={resetGoalForm}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmitGoal}
                  disabled={createGoalMutation.isPending || updateGoalMutation.isPending}
                >
                  {editingGoal ? "Actualizar" : "Crear"} Objetivo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Review Form Modal */}
      {showReviewForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
          onClick={resetReviewForm}
        >
          <Card className="max-w-3xl w-full my-8" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingReview ? "Editar Evaluación" : "Nueva Evaluación"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetReviewForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Empleado *</Label>
                  <Select 
                    value={reviewFormData.employee_id || ""} 
                    onValueChange={(val) => setReviewFormData({ ...reviewFormData, employee_id: val })}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
                    <SelectContent>
                      {allEmployees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.first_name} {emp.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Periodo *</Label>
                  <Input
                    value={reviewFormData.review_period || ""}
                    onChange={(e) => setReviewFormData({ ...reviewFormData, review_period: e.target.value })}
                    placeholder="Ej: Q1 2024"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Evaluación</Label>
                  <Select 
                    value={reviewFormData.review_type || "Trimestral"} 
                    onValueChange={(val) => setReviewFormData({ ...reviewFormData, review_type: val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Trimestral">Trimestral</SelectItem>
                      <SelectItem value="Semestral">Semestral</SelectItem>
                      <SelectItem value="Anual">Anual</SelectItem>
                      <SelectItem value="Extraordinaria">Extraordinaria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha de Evaluación *</Label>
                  <Input
                    type="date"
                    value={reviewFormData.review_date || ""}
                    onChange={(e) => setReviewFormData({ ...reviewFormData, review_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-bold text-slate-900 mb-3">Evaluación del Manager (1-5)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Productividad</Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={reviewFormData.manager_assessment_productivity || ""}
                      onChange={(e) => setReviewFormData({ ...reviewFormData, manager_assessment_productivity: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Calidad del Trabajo</Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={reviewFormData.manager_assessment_quality || ""}
                      onChange={(e) => setReviewFormData({ ...reviewFormData, manager_assessment_quality: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Trabajo en Equipo</Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={reviewFormData.manager_assessment_teamwork || ""}
                      onChange={(e) => setReviewFormData({ ...reviewFormData, manager_assessment_teamwork: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Liderazgo</Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={reviewFormData.manager_assessment_leadership || ""}
                      onChange={(e) => setReviewFormData({ ...reviewFormData, manager_assessment_leadership: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Iniciativa</Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={reviewFormData.manager_assessment_initiative || ""}
                      onChange={(e) => setReviewFormData({ ...reviewFormData, manager_assessment_initiative: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Comentarios del Manager</Label>
                <Textarea
                  value={reviewFormData.manager_comments || ""}
                  onChange={(e) => setReviewFormData({ ...reviewFormData, manager_comments: e.target.value })}
                  rows={3}
                />
              </div>

              <div>
                <Label>Fortalezas</Label>
                <Textarea
                  value={reviewFormData.strengths || ""}
                  onChange={(e) => setReviewFormData({ ...reviewFormData, strengths: e.target.value })}
                  rows={2}
                />
              </div>

              <div>
                <Label>Áreas de Mejora</Label>
                <Textarea
                  value={reviewFormData.areas_for_improvement || ""}
                  onChange={(e) => setReviewFormData({ ...reviewFormData, areas_for_improvement: e.target.value })}
                  rows={2}
                />
              </div>

              <div>
                <Label>Plan de Acción</Label>
                <Textarea
                  value={reviewFormData.action_plan || ""}
                  onChange={(e) => setReviewFormData({ ...reviewFormData, action_plan: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Calificación General</Label>
                  <Select 
                    value={reviewFormData.overall_rating || ""} 
                    onValueChange={(val) => setReviewFormData({ ...reviewFormData, overall_rating: val })}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Necesita Mejorar">Necesita Mejorar</SelectItem>
                      <SelectItem value="Cumple Expectativas">Cumple Expectativas</SelectItem>
                      <SelectItem value="Supera Expectativas">Supera Expectativas</SelectItem>
                      <SelectItem value="Excepcional">Excepcional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estado</Label>
                  <Select 
                    value={reviewFormData.status || "Pendiente Autoevaluación"} 
                    onValueChange={(val) => setReviewFormData({ ...reviewFormData, status: val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pendiente Autoevaluación">Pendiente Autoevaluación</SelectItem>
                      <SelectItem value="Pendiente Manager">Pendiente Manager</SelectItem>
                      <SelectItem value="Completada">Completada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={resetReviewForm}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmitReview}
                  disabled={createReviewMutation.isPending || updateReviewMutation.isPending}
                >
                  {editingReview ? "Actualizar" : "Crear"} Evaluación
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}