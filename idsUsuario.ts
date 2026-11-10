// Gerador de id de usuário que NUNCA repete um id que já exista ou que algum registro ainda referencie.
// Antes o id era "200 + quantidade de usuários + 1": se a quantidade diminuísse (ex.: conta da ficha recusada pelo motorista),
// a próxima conta herdava o id de outra, sobrescrevia o registro no banco (chave `u-<id>`) e os alunos passavam a
// apontar para o responsável errado.

export interface ComId { id: number }

/** Campos das paradas (alunos) que guardam o id de um usuário. Esses ids continuam "ocupados" mesmo que a conta tenha sido apagada. */
const CAMPOS_REFERENCIA = ['vinculado_usuario_id', 'usuario_pre_id', 'id_motorista'] as const;

/** Menor id permitido para contas novas (abaixo disso ficam as contas de demonstração). */
export const ID_MINIMO_USUARIO = 200;

/**
 * Próximo id livre: maior entre o piso, a marca d'água guardada (maior id já entregue, sobrevive a reinícios),
 * os ids das contas atuais e os ids ainda referenciados por alunos, mais 1.
 */
export function proximoIdUsuario(usuarios: ComId[], paradas: any[] = [], marcaAgua = 0): number {
  let maior = Math.max(ID_MINIMO_USUARIO, Number.isFinite(marcaAgua) ? Math.floor(marcaAgua) : 0);
  for (const u of usuarios) if (Number.isFinite(u.id) && u.id > maior) maior = u.id;
  for (const p of paradas) {
    for (const campo of CAMPOS_REFERENCIA) {
      const v = Number(p?.[campo]);
      if (Number.isFinite(v) && v > maior) maior = v;
    }
  }
  return maior + 1;
}

/** Ids que aparecem em mais de uma conta (não deveria acontecer; serve de alarme no log). */
export function idsDuplicados(usuarios: ComId[]): number[] {
  const vistos = new Set<number>();
  const repetidos = new Set<number>();
  for (const u of usuarios) { if (vistos.has(u.id)) repetidos.add(u.id); else vistos.add(u.id); }
  return [...repetidos];
}
