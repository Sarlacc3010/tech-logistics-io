import React from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '../app/components/ui/accordion';

export interface SolutionStep {
  step_number: number;
  title: string;
  description: string;
  data?: any;
}

interface AlgorithmStepsProps {
  steps: SolutionStep[] | null | undefined;
  dark?: boolean;
  heading?: string;
}

function isPlainObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatPrimitive(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  return String(value);
}

function DataView({ value, dark }: { value: any; dark: boolean }) {
  const borderColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const mutedText = dark ? 'text-white/50' : 'text-black/50';

  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className={`font-mono text-[11px] ${mutedText}`}>—</span>;

    if (value.every(v => isPlainObject(v))) {
      const columns = Array.from(new Set(value.flatMap(v => Object.keys(v))));
      return (
        <div className="overflow-x-auto rounded border" style={{ borderColor }}>
          <table className="w-full text-[11px] font-mono">
            <thead style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
              <tr>
                {columns.map(col => (
                  <th key={col} className="p-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {value.map((row, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col} className="p-1.5 whitespace-nowrap">
                      {isPlainObject(row[col]) || Array.isArray(row[col])
                        ? <DataView value={row[col]} dark={dark} />
                        : formatPrimitive(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <ul className="list-disc list-inside space-y-0.5">
        {value.map((v, i) => (
          <li key={i} className="font-mono text-[11px]">
            {isPlainObject(v) || Array.isArray(v) ? <DataView value={v} dark={dark} /> : formatPrimitive(v)}
          </li>
        ))}
      </ul>
    );
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    return (
      <dl className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: 'max-content 1fr' }}>
        {entries.map(([key, v]) => (
          <React.Fragment key={key}>
            <dt className={`font-mono text-[11px] ${mutedText} whitespace-nowrap`}>{key}</dt>
            <dd className="font-mono text-[11px]">
              {isPlainObject(v) || Array.isArray(v) ? <DataView value={v} dark={dark} /> : formatPrimitive(v)}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    );
  }

  return <span className="font-mono text-[11px]">{formatPrimitive(value)}</span>;
}

export function AlgorithmSteps({ steps, dark = true, heading = 'Detalle paso a paso' }: AlgorithmStepsProps) {
  if (!steps || steps.length === 0) return null;

  const borderColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  return (
    <div className="rounded border" style={{ borderColor }}>
      <div className="px-3 py-2 border-b" style={{ borderColor }}>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{heading}</span>
      </div>
      <Accordion type="single" collapsible className="px-3">
        {steps.map(step => (
          <AccordionItem key={step.step_number} value={`step-${step.step_number}`}>
            <AccordionTrigger>
              <span className="font-mono text-xs">
                <span className="text-primary font-semibold">Paso {step.step_number}.</span> {step.title}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <p className={`text-xs mb-2 ${dark ? 'text-white/70' : 'text-black/70'}`}>{step.description}</p>
              <DataView value={step.data} dark={dark} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
