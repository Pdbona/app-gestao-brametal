// Validação/formatação de CPF — usado no cadastro de Colaborador e na
// etapa de check-in público (CheckinPublicScreen.jsx) pra identificar
// quem está confirmando presença.

export function normalizarCpf(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function formatarCpf(valor) {
  const d = normalizarCpf(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Algoritmo padrão de validação (módulo 11) — rejeita também sequências
// tipo "111.111.111-11", que passariam no cálculo mas não são CPFs reais.
export function validarCpf(valor) {
  const cpf = normalizarCpf(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (base.length + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const digito1 = calcularDigito(cpf.slice(0, 9));
  const digito2 = calcularDigito(cpf.slice(0, 10));
  return digito1 === Number(cpf[9]) && digito2 === Number(cpf[10]);
}
