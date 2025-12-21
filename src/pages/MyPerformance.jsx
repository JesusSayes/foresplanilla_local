import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Target, Star, TrendingUp, CheckCircle, Clock, 
  AlertCircle, Award, Calendar
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function MyPerformance() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [activeTab, setActiveTab] = useState("goals");
  const [showSelfAssessment, setShowSelfAssessment] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [selfAssessmentData, setSelfAssessmentData] = useState({});

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

  const { data: myGoals = [] } = useQuery({
    queryKey: ["myGoals", employee?.id],
    queryFn: async () => {
      if (!employee) return [];
      return await base44.entities.PerformanceGoal.filter({ 
        employee_id: employee.id 
      }, "-created_date");
    },
    enabled: !!employee,
  });

  const { data: myReviews = [] } = useQuery({
    queryKey: ["myReviews", employee?.id],
    queryFn: async () => {
      if (!employee) return [];
      return await base44.entities.PerformanceReview.filter({ 
        employee_id: employee.id 
      }, "-review_date");
    },
    enabled: !!employee,
  });

  const updateReviewMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.PerformanceReview.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["myReviews"]);
      toast.success("Autoevaluación enviada exitosamente");
      setShowSelfAssessment(false);
      setSelectedReview(null);
      setSelfAssessmentData({});
    },
    onError: () => {
      toast.error("Error al enviar la autoevaluación");
    },
  });

  const handleStartSelfAssessment = (review) => {
    setSelectedReview(review);
    setSelfAssessmentData({
      self_assessment_productivity: review.self_assessment_productivity || 3,
      self_assessment_quality: review.self_assessment_quality || 3,
      self_assessment_teamwork: review.self_assessment_teamwork || 3,
      self_assessment_leadership: review.self_assessment_leadership || 3,
      self_assessment_initiative: review.self_assessment_initiative || 3,
      self_assessment_comments: review.self_assessment_comments || "",
    });
    setShowSelfAssessment(true);
  };

  const handleSubmitSelfAssessment = () => {
    if (!selectedReview) return;

    const data = {
      ...selfAssessmentData,
      status: "Pendiente Manager",
    };

    updateReviewMutation.mutate({ id: selectedReview.id, data });
  };

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

  const calculateAverageRating = (ratings) => {
    const validRatings = ratings.filter(r => r > 0);
    if (validRatings.length === 0) return 0;
    return (validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length).toFixed(1);
  };

  const stats = {
    totalGoals: myGoals.length,
    activeGoals: myGoals.filter(g => g.status === "En Progreso" || g.status === "Pendiente").length,
    completedGoals: myGoals.filter(g => g.status === "Completado").length,
    pendingAssessments: myReviews.filter(r => r.status === "Pendiente Autoevaluación").length,
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Mi Desempeño
          </h1>
          <p className="text-slate-600 text-lg">
            Revisa tus objetivos, evaluaciones y progreso
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
              <p className="text-slate-600 text-sm">Mis Objetivos</p>
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
              <p className="text-slate-600 text-sm">En Progreso</p>
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
              <p className="text-slate-600 text-sm">Completados</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-amber-100 rounded-xl">
                  <Star className="w-6 h-6 text-amber-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.pendingAssessments}
              </div>
              <p className="text-slate-600 text-sm">Autoevaluaciones Pendientes</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="goals">Mis Objetivos</TabsTrigger>
            <TabsTrigger value="reviews">Evaluaciones</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="goals" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">Mis Objetivos de Desempeño</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {myGoals.length === 0 ? (
                  <div className="text-center py-12">
                    <Target className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No tienes objetivos asignados</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {myGoals.map(goal => {
                      const StatusIcon = getGoalStatusConfig(goal.status).icon;
                      const progress = calculateProgress(goal);
                      const daysLeft = goal.due_date ? differenceInDays(new Date(goal.due_date), new Date()) : 0;

                      return (
                        <div key={goal.id} className="p-5 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                          <div className="flex items-center gap-3 mb-3">
                            <h4 className="font-bold text-slate-900 text-lg">{goal.title}</h4>
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

                          {goal.description && (
                            <p className="text-sm text-slate-600 mb-4">{goal.description}</p>
                          )}

                          <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                            <div>
                              <p className="text-slate-600">Categoría</p>
                              <p className="font-semibold text-slate-900">{goal.category}</p>
                            </div>
                            <div>
                              <p className="text-slate-600">Progreso</p>
                              <p className="font-semibold text-indigo-600">
                                {goal.current_value || 0} / {goal.target_value} {goal.unit}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">Fecha Límite</p>
                              <p className={`font-semibold ${daysLeft < 7 && daysLeft >= 0 ? 'text-amber-600' : daysLeft < 0 ? 'text-red-600' : ''}`}>
                                {format(new Date(goal.due_date), 'dd/MM/yyyy')}
                                {daysLeft >= 0 && ` (${daysLeft}d restantes)`}
                                {daysLeft < 0 && ' (Vencido)'}
                              </p>
                            </div>
                          </div>

                          <div className="w-full bg-slate-200 rounded-full h-3 mb-2">
                            <div 
                              className="bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <p className="text-slate-600">{progress.toFixed(1)}% completado</p>
                            {progress >= 100 && (
                              <Badge className="bg-green-100 text-green-700">
                                <Award className="w-3 h-3 mr-1" />
                                ¡Meta alcanzada!
                              </Badge>
                            )}
                          </div>

                          {goal.notes && (
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                              <p className="text-blue-900"><strong>Notas:</strong> {goal.notes}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">Mis Evaluaciones</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {myReviews.length === 0 ? (
                  <div className="text-center py-12">
                    <Star className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No tienes evaluaciones</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {myReviews.map(review => {
                      const avgSelf = review.self_assessment_productivity ? 
                        calculateAverageRating([
                          review.self_assessment_productivity,
                          review.self_assessment_quality,
                          review.self_assessment_teamwork,
                          review.self_assessment_leadership,
                          review.self_assessment_initiative
                        ]) : null;
                      
                      const avgManager = review.manager_assessment_productivity ? 
                        calculateAverageRating([
                          review.manager_assessment_productivity,
                          review.manager_assessment_quality,
                          review.manager_assessment_teamwork,
                          review.manager_assessment_leadership,
                          review.manager_assessment_initiative
                        ]) : null;

                      return (
                        <div key={review.id} className="p-5 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <h4 className="font-bold text-slate-900 text-lg">{review.review_period}</h4>
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
                            {review.status === "Pendiente Autoevaluación" && (
                              <Button
                                size="sm"
                                onClick={() => handleStartSelfAssessment(review)}
                                className="bg-indigo-600 hover:bg-indigo-700"
                              >
                                Completar Autoevaluación
                              </Button>
                            )}
                          </div>

                          <p className="text-sm text-slate-600 mb-4">
                            <Calendar className="w-4 h-4 inline mr-1" />
                            Fecha: {format(new Date(review.review_date), 'dd/MM/yyyy')}
                          </p>

                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <h5 className="font-semibold text-slate-900 mb-2">Mi Autoevaluación</h5>
                              {avgSelf ? (
                                <>
                                  <div className="text-3xl font-bold text-blue-600 mb-2">
                                    {avgSelf}/5
                                  </div>
                                  <div className="space-y-1 text-sm">
                                    <p>Productividad: {review.self_assessment_productivity}/5</p>
                                    <p>Calidad: {review.self_assessment_quality}/5</p>
                                    <p>Trabajo en Equipo: {review.self_assessment_teamwork}/5</p>
                                    <p>Liderazgo: {review.self_assessment_leadership}/5</p>
                                    <p>Iniciativa: {review.self_assessment_initiative}/5</p>
                                  </div>
                                  {review.self_assessment_comments && (
                                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                                      <p className="text-blue-900">{review.self_assessment_comments}</p>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className="text-slate-500 italic">Pendiente de completar</p>
                              )}
                            </div>

                            <div>
                              <h5 className="font-semibold text-slate-900 mb-2">Evaluación del Manager</h5>
                              {avgManager ? (
                                <>
                                  <div className="text-3xl font-bold text-indigo-600 mb-2">
                                    {avgManager}/5
                                  </div>
                                  <div className="space-y-1 text-sm">
                                    <p>Productividad: {review.manager_assessment_productivity}/5</p>
                                    <p>Calidad: {review.manager_assessment_quality}/5</p>
                                    <p>Trabajo en Equipo: {review.manager_assessment_teamwork}/5</p>
                                    <p>Liderazgo: {review.manager_assessment_leadership}/5</p>
                                    <p>Iniciativa: {review.manager_assessment_initiative}/5</p>
                                  </div>
                                  {review.manager_comments && (
                                    <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded text-sm">
                                      <p className="text-indigo-900">{review.manager_comments}</p>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className="text-slate-500 italic">Pendiente del manager</p>
                              )}
                            </div>
                          </div>

                          {review.status === "Completada" && (
                            <div className="mt-4 pt-4 border-t">
                              <div className="grid grid-cols-3 gap-4">
                                {review.strengths && (
                                  <div>
                                    <h6 className="font-semibold text-slate-900 mb-1">Fortalezas</h6>
                                    <p className="text-sm text-slate-600">{review.strengths}</p>
                                  </div>
                                )}
                                {review.areas_for_improvement && (
                                  <div>
                                    <h6 className="font-semibold text-slate-900 mb-1">Áreas de Mejora</h6>
                                    <p className="text-sm text-slate-600">{review.areas_for_improvement}</p>
                                  </div>
                                )}
                                {review.overall_rating && (
                                  <div>
                                    <h6 className="font-semibold text-slate-900 mb-1">Calificación General</h6>
                                    <Badge className={
                                      review.overall_rating === "Excepcional" ? "bg-green-100 text-green-700" :
                                      review.overall_rating === "Supera Expectativas" ? "bg-blue-100 text-blue-700" :
                                      review.overall_rating === "Cumple Expectativas" ? "bg-yellow-100 text-yellow-700" :
                                      "bg-red-100 text-red-700"
                                    }>
                                      {review.overall_rating}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                              {review.action_plan && (
                                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                                  <h6 className="font-semibold text-slate-900 mb-1">Plan de Acción</h6>
                                  <p className="text-sm text-green-900">{review.action_plan}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">Resumen de Desempeño</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-bold text-slate-900 mb-4">Objetivos</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="text-slate-600">Total</span>
                        <span className="font-bold text-slate-900">{stats.totalGoals}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <span className="text-green-700">Completados</span>
                        <span className="font-bold text-green-700">{stats.completedGoals}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <span className="text-blue-700">En Progreso</span>
                        <span className="font-bold text-blue-700">{stats.activeGoals}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg">
                        <span className="text-indigo-700">Tasa de Completitud</span>
                        <span className="font-bold text-indigo-700">
                          {stats.totalGoals > 0 ? ((stats.completedGoals / stats.totalGoals) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-4">Evaluaciones</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="text-slate-600">Total Evaluaciones</span>
                        <span className="font-bold text-slate-900">{myReviews.length}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <span className="text-green-700">Completadas</span>
                        <span className="font-bold text-green-700">
                          {myReviews.filter(r => r.status === "Completada").length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                        <span className="text-amber-700">Pendientes</span>
                        <span className="font-bold text-amber-700">{stats.pendingAssessments}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Self-Assessment Modal */}
      {showSelfAssessment && selectedReview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
          onClick={() => setShowSelfAssessment(false)}
        >
          <Card className="max-w-2xl w-full my-8" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  Autoevaluación - {selectedReview.review_period}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowSelfAssessment(false)}>
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-slate-600 mb-4">
                Evalúa tu desempeño del {selectedReview.review_period} en una escala del 1 al 5:
              </p>

              <div className="space-y-4">
                <div>
                  <Label>Productividad (1-5)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={selfAssessmentData.self_assessment_productivity || 3}
                    onChange={(e) => setSelfAssessmentData({
                      ...selfAssessmentData,
                      self_assessment_productivity: parseInt(e.target.value)
                    })}
                  />
                </div>

                <div>
                  <Label>Calidad del Trabajo (1-5)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={selfAssessmentData.self_assessment_quality || 3}
                    onChange={(e) => setSelfAssessmentData({
                      ...selfAssessmentData,
                      self_assessment_quality: parseInt(e.target.value)
                    })}
                  />
                </div>

                <div>
                  <Label>Trabajo en Equipo (1-5)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={selfAssessmentData.self_assessment_teamwork || 3}
                    onChange={(e) => setSelfAssessmentData({
                      ...selfAssessmentData,
                      self_assessment_teamwork: parseInt(e.target.value)
                    })}
                  />
                </div>

                <div>
                  <Label>Liderazgo (1-5)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={selfAssessmentData.self_assessment_leadership || 3}
                    onChange={(e) => setSelfAssessmentData({
                      ...selfAssessmentData,
                      self_assessment_leadership: parseInt(e.target.value)
                    })}
                  />
                </div>

                <div>
                  <Label>Iniciativa (1-5)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={selfAssessmentData.self_assessment_initiative || 3}
                    onChange={(e) => setSelfAssessmentData({
                      ...selfAssessmentData,
                      self_assessment_initiative: parseInt(e.target.value)
                    })}
                  />
                </div>

                <div>
                  <Label>Comentarios</Label>
                  <Textarea
                    value={selfAssessmentData.self_assessment_comments || ""}
                    onChange={(e) => setSelfAssessmentData({
                      ...selfAssessmentData,
                      self_assessment_comments: e.target.value
                    })}
                    rows={4}
                    placeholder="Describe tus logros, desafíos y aprendizajes durante este periodo..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowSelfAssessment(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmitSelfAssessment}
                  disabled={updateReviewMutation.isPending}
                >
                  {updateReviewMutation.isPending ? "Enviando..." : "Enviar Autoevaluación"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}