import React from 'react';
import { Package, MapPin, Scale, Navigation, Edit2 } from 'lucide-react';

interface LogisticsData {
  origin: string;
  destination: string;
  weight: number;
  unit: string;
  stops: string[];
}

interface LogisticsFormsProps {
  data: LogisticsData | null;
  onChange: (newData: LogisticsData) => void;
}

export const LogisticsForms: React.FC<LogisticsFormsProps> = ({ data, onChange }) => {
  if (!data) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-gray-500 h-full min-h-[300px]">
        <Edit2 size={48} className="mb-4 text-gray-300" />
        <p>No hay datos extraídos por la IA aún.</p>
        <p className="text-sm mt-2 text-gray-400">Pide al Tutor AI que resuelva un problema.</p>
      </div>
    );
  }

  const handleChange = (field: keyof LogisticsData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
      <h3 className="text-lg font-semibold mb-6 text-gray-800 dark:text-gray-100 flex items-center gap-2">
        <Edit2 size={20} className="text-blue-500" /> 
        Editor Manual de Logística
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Origin */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <MapPin size={16} className="text-red-500" /> Origen
          </label>
          <input 
            type="text" 
            value={data.origin} 
            onChange={(e) => handleChange('origin', e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>

        {/* Destination */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Navigation size={16} className="text-green-500" /> Destino
          </label>
          <input 
            type="text" 
            value={data.destination} 
            onChange={(e) => handleChange('destination', e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>

        {/* Weight */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Scale size={16} className="text-purple-500" /> Carga Total
          </label>
          <div className="flex gap-2">
            <input 
              type="number" 
              value={data.weight} 
              onChange={(e) => handleChange('weight', parseFloat(e.target.value) || 0)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
            <select 
              value={data.unit}
              onChange={(e) => handleChange('unit', e.target.value)}
              className="w-1/3 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition"
            >
              <option value="kg">kg</option>
              <option value="tons">Tons</option>
              <option value="lbs">lbs</option>
            </select>
          </div>
        </div>

        {/* Stops */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Package size={16} className="text-amber-500" /> Paradas (separadas por coma)
          </label>
          <input 
            type="text" 
            value={data.stops?.join(', ') || ''} 
            onChange={(e) => handleChange('stops', e.target.value.split(',').map(s => s.trim()))}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>
      </div>
    </div>
  );
};
