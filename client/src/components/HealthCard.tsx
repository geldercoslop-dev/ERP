import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';

interface HealthCardProps {
  title: string;
  value: string | number;
  unit?: string;
  status: 'ok' | 'warning' | 'critical';
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
}

export function HealthCard({ 
  title, 
  value, 
  unit, 
  status, 
  icon: Icon, 
  subtitle,
  trend 
}: HealthCardProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'ok': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'ok': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return '↗️';
      case 'down': return '↘️';
      case 'stable': return '➡️';
      default: return null;
    }
  };

  return (
    <Card className={`transition-all duration-300 hover:shadow-md ${getStatusColor()}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-1">
            {trend && (
              <span className="text-xs" title="Tendência">
                {getTrendIcon()}
              </span>
            )}
            {getStatusIcon()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value}{unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}
