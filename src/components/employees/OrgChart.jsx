import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ChevronDown, ChevronRight, Building, Crown } from "lucide-react";

export default function OrgChart({ employees }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Construir árbol jerárquico
  const buildHierarchy = () => {
    const employeeMap = new Map();
    const roots = [];

    // Primera pasada: crear mapa de empleados
    employees.forEach(emp => {
      employeeMap.set(emp.id, { ...emp, children: [] });
    });

    // Segunda pasada: construir relaciones
    employees.forEach(emp => {
      const node = employeeMap.get(emp.id);
      
      // Buscar supervisor por nombre
      if (emp.supervisor_name) {
        const supervisor = employees.find(e => 
          `${e.first_name} ${e.last_name}`.toLowerCase() === emp.supervisor_name.toLowerCase()
        );
        
        if (supervisor) {
          const supervisorNode = employeeMap.get(supervisor.id);
          if (supervisorNode) {
            supervisorNode.children.push(node);
          } else {
            roots.push(node);
          }
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const toggleNode = (nodeId) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const expandAll = () => {
    const allIds = new Set(employees.map(e => e.id));
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const EmployeeNode = ({ node, level = 0 }) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    const getRoleBadgeColor = (role) => {
      if (role === "admin") return "bg-purple-100 text-purple-700 border-purple-300";
      if (role === "manager") return "bg-blue-100 text-blue-700 border-blue-300";
      return "bg-green-100 text-green-700 border-green-300";
    };

    return (
      <div className="mb-2">
        <div 
          className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
            level === 0 
              ? "bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200" 
              : "bg-white border-slate-200 hover:shadow-md"
          }`}
          style={{ marginLeft: `${level * 40}px` }}
        >
          {hasChildren && (
            <button
              onClick={() => toggleNode(node.id)}
              className="p-1 hover:bg-slate-100 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-600" />
              )}
            </button>
          )}
          
          {!hasChildren && <div className="w-6" />}

          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
            {node.first_name[0]}{node.last_name[0]}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900">
                {node.first_name} {node.last_name}
              </h4>
              {level === 0 && <Crown className="w-4 h-4 text-yellow-500" />}
              <Badge className={getRoleBadgeColor(node.role)}>
                {node.role === "admin" ? "Admin" : node.role === "manager" ? "Manager" : "Empleado"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
              <span className="font-medium">{node.position}</span>
              <span>•</span>
              <span>{node.department_name}</span>
              {hasChildren && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {node.children.length} {node.children.length === 1 ? "subordinado" : "subordinados"}
                  </span>
                </>
              )}
            </div>
          </div>

          <Badge variant="outline" className="text-xs">
            {node.employee_code}
          </Badge>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-2">
            {node.children
              .sort((a, b) => a.first_name.localeCompare(b.first_name))
              .map(child => (
                <EmployeeNode key={child.id} node={child} level={level + 1} />
              ))}
          </div>
        )}
      </div>
    );
  };

  const hierarchy = buildHierarchy();

  return (
    <div>
      <div className="flex gap-3 mb-6">
        <Button onClick={expandAll} variant="outline" size="sm">
          Expandir Todo
        </Button>
        <Button onClick={collapseAll} variant="outline" size="sm">
          Contraer Todo
        </Button>
      </div>

      {hierarchy.length === 0 ? (
        <div className="text-center py-12">
          <Building className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">No hay empleados para mostrar en el organigrama</p>
        </div>
      ) : (
        <div className="space-y-4">
          {hierarchy.map(root => (
            <EmployeeNode key={root.id} node={root} level={0} />
          ))}
        </div>
      )}
    </div>
  );
}