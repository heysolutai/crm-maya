import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ParameterTableProps {
  parameters: Parameter[];
  title?: string;
}

export function ParameterTable({ parameters, title = "Parâmetros" }: ParameterTableProps) {
  if (parameters.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm">{title}</h4>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Obrigatório</TableHead>
              <TableHead>Descrição</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parameters.map((param) => (
              <TableRow key={param.name}>
                <TableCell className="font-mono text-sm">{param.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{param.type}</Badge>
                </TableCell>
                <TableCell>
                  {param.required ? (
                    <Badge variant="destructive">Sim</Badge>
                  ) : (
                    <Badge variant="secondary">Não</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{param.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
