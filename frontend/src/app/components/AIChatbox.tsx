import React, { useState } from 'react';
import { MessageSquare, Send, Bot, User, Loader2 } from 'lucide-react';

interface AIChatboxProps {
  onDataExtracted: (data: any) => void;
}

export const AIChatbox: React.FC<AIChatboxProps> = ({ onDataExtracted }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
    { role: 'ai', content: '¡Hola! Soy tu tutor logístico socrático. ¿En qué problema te puedo ayudar hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      // Reemplazar la URL con la variable de entorno de tu backend
      const response = await fetch('http://localhost:5000/api/ai-tutor/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();
      
      if (data.success) {
        setMessages(prev => [
          ...prev, 
          { role: 'ai', content: `He analizado tu problema.\n\nFeedback: ${data.data.feedback}` }
        ]);
        
        // Pasa los datos extraídos al componente padre (App.tsx)
        if (data.data.finalData) {
          onDataExtracted(data.data.finalData);
        }
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: 'Hubo un error procesando tu solicitud.' }]);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'ai', content: 'Hubo un error de conexión con el Tutor AI.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 bg-blue-600 text-white flex items-center gap-2">
        <Bot size={24} />
        <h3 className="font-semibold text-lg">Tutor AI (Multi-LLM)</h3>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'ai' && <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Bot size={18} /></div>}
            
            <div className={`p-3 rounded-2xl max-w-[80%] text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none whitespace-pre-wrap'}`}>
              {msg.content}
            </div>

            {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600"><User size={18} /></div>}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 justify-start">
             <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Bot size={18} /></div>
             <div className="p-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none flex items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> Analizando y Validando...
             </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ej: Transportar 500kg de Quito a Manta..."
            className="w-full pl-4 pr-12 py-3 rounded-full bg-gray-100 dark:bg-gray-900 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-800 dark:text-gray-200"
          />
          <button 
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
