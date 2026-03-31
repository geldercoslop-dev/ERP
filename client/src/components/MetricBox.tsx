import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricBoxProps {
  title: string;
  value: number;
  max?: number;
  unit?: string;
  format?: 'number' | 'percentage' | 'bytes' | 'duration';
  threshold?: {
    good: number;
    warning: number;
    critical: number;
  };
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function MetricBox({ 
  title, 
  value, 
  max = 100, 
  unit, 
  format = 'number',
  threshold = { good: 80, warning: 50, critical: 20 },
  trend,
  trendValue,
  description,
  icon: Icon
}: MetricBoxProps) {
  const formatValue = (val: number): string => {
    switch (format) {
      case 'percentage':
        return `${val.toFixed(1)}%`;
      case 'bytes':
        if (val < 1024) return `${val} B`;
        if (val < 1024 * 1024) return `${(val / 1024).toFixed(1)} KB`;
        if (val < 1024 * 1024 * 1024) return `${(val / (1024 * 1024)).toFixed(1)} MB`;
        return `${(val / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      case 'duration':
        if (val < 1000) return `${val} ms`;
        if (val < 60000) return `${(val / 1000).toFixed(1)} s`;
        return `${(val / 60000).toFixed(1)} min`;
      default:
        return val.toLocaleString();
    }
  };

  const getProgressColor = () => {
    const percentage = (value / max) * 100;
    if (percentage >= threshold.good) return 'bg-green-500';
    if (percentage >= threshold.warning) return 'bg-yellow-500';
    if (percentage >= threshold.critical) return 'bg-red-500';
    return 'bg-gray-500';
  };

  const getTextColor = () => {
    const percentage = (value / max) * 100;
    if (percentage >= threshold.good) return 'text-green-600';
    if (percentage >= threshold.warning) return 'text-yellow-600';
    if (percentage >= threshold.critical) return 'text-red-600';
    return 'text-gray-600';
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-3 w-3" />;
      case 'down': return <TrendingDown className="h-3 w-3" />;
      default: return <Minus className="h-3 w-3" />;
    }
  };

  const getTrendColor = () => {
    switch (trend) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      default: return 'text-gray-400';
    }
  };

  const progressValue = Math.min((value / max) * 100, 100);

  return (
    <Card className="transition-all duration-300 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
          </CardTitle>
          {trend && trendValue && (
            <div className={`flex items-center gap-1 text-xs ${getTrendColor()}`}>
              {getTrendIcon()}
              <span>{formatValue(trendValue)}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${getTextColor()}`}>
            {formatValue(value)}
          </span>
          {unit && (
            <span className="text-sm text-muted-foreground">{unit}</span>
          )}
        </div>
        
        <div className="space-y-2">
          <Progress 
            value={progressValue} 
            className="h-2"
            // @ts-ignore - o Progress component aceita a propriedade style
            style={{
              '--progress-background': getProgressColor().replace('bg-', '').replace('-500', '')
            } as React.CSSProperties}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span>{formatValue(max)}</span>
          </div>
        </div>

        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
