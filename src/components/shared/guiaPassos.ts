/**
 * Passos do guia do primeiro acesso (motorista e responsável).
 * Texto em linguagem simples. Regras de privacidade: nada aqui promete mapa, GPS ou endereço de criança ao responsável.
 */

export type PapelGuia = 'motorista' | 'responsavel';
export type AbaMotorista = 'diario' | 'mapa' | 'mensagens' | 'mais' | 'cadastro' | 'abastecimento' | 'ajustes';

export interface PassoGuia {
  id: string;
  titulo: string;
  texto: string;
  itens?: string[];
  /** Motorista: tela que o guia abre ao chegar neste passo, para a pessoa ver o que está sendo explicado. */
  aba?: AbaMotorista;
  /** Botão de dados de exemplo (só aparece no modo de teste). */
  acao?: 'exemplos';
}

export const PASSOS_MOTORISTA: PassoGuia[] = [
  {
    id: 'boas-vindas',
    titulo: 'Bem-vindo ao VanEscolar',
    texto: 'Em poucos passos você vê como usar o painel no dia a dia. Pode fechar quando quiser e voltar em Mais > Guia passo a passo.',
    itens: ['Segurança das crianças vem primeiro: a família nunca vê mapa nem endereço.', 'No ambiente de teste, nada do que você fizer aqui é real.'],
    aba: 'diario',
    acao: 'exemplos'
  },
  {
    id: 'hoje',
    titulo: 'A tela Hoje',
    texto: 'É a sua tela principal: os alunos do dia, na ordem da rota.',
    itens: [
      'O menu fica embaixo: Hoje, Mapa, Mensagens e Mais.',
      'Um aviso amarelo mostra famílias aguardando a sua aprovação.',
      'Antes de iniciar a rota aparece o cartão "Quando preciso sair".'
    ],
    aba: 'diario'
  },
  {
    id: 'cadastrar',
    titulo: 'Cadastrar um aluno',
    texto: 'Vá em Mais > Cadastrar alunos > Cadastrar aluno e preencha uma vez só.',
    itens: [
      'Nome do aluno, escola, turno (manhã ou tarde), nome e WhatsApp do responsável, endereço de embarque e ponto de referência.',
      'Marque a caixa dizendo que o responsável autorizou o uso dos dados (obrigatória).',
      'Ao salvar, o app mostra uma mensagem pronta de WhatsApp com o código VAN-… para a família. O endereço não vai na mensagem.'
    ],
    aba: 'cadastro'
  },
  {
    id: 'link',
    titulo: 'Deixar a família preencher',
    texto: 'Em vez de digitar, gere o link do formulário e mande pelo WhatsApp.',
    itens: [
      'A família preenche no celular, sem criar conta. O link vale 7 dias.',
      'O pedido aparece em "Novos alunos aguardando": escolha o lugar na van e toque em Confirmar.',
      'Se quiser, escreva as regras do transporte: a família precisa aceitar antes de enviar.'
    ],
    aba: 'cadastro'
  },
  {
    id: 'importar',
    titulo: 'Importar vários alunos',
    texto: 'No começo do ano, cole a lista de uma vez em "Importar vários alunos".',
    itens: [
      'Uma linha por aluno: aluno, escola, turno, responsável, WhatsApp e endereço. Use ponto e vírgula entre as colunas.',
      'Toque em "Conferir lista": cada linha aparece como OK, Repetido ou Erro. Nada é criado ainda.',
      'Marque a autorização dos responsáveis e toque em Importar. Até 60 por vez.'
    ],
    aba: 'cadastro'
  },
  {
    id: 'horarios',
    titulo: 'Horários da escola',
    texto: 'Vá em Mais > Rotas e ajustes > Horários da escola, por turno.',
    itens: [
      'Defina entrada e saída uma vez para cada escola e turno. Os alunos usam esses horários.',
      'O responsável vê o horário, mas não consegue alterar.'
    ],
    aba: 'ajustes'
  },
  {
    id: 'ponto',
    titulo: 'Marcar o ponto de embarque',
    texto: 'Em Hoje, toque no aluno e use "Marcar local de embarque". Só o motorista marca o ponto.',
    itens: [
      'Aluno sem ponto no mapa fica de fora do cálculo de "Quando preciso sair".',
      'O ponto nunca aparece para a família.'
    ],
    aba: 'diario'
  },
  {
    id: 'antes-de-sair',
    titulo: 'Antes de sair',
    texto: 'Escolha Auto, Ida ou Volta no topo. No Auto, o app sugere pelo horário da escola.',
    itens: [
      '"Calcular a partir de onde estou" usa o GPS do celular e diz a hora de sair, com folga de 5 minutos.',
      'Na Volta, chegue à escola 15 minutos antes da saída.',
      'Permita a localização do site quando o celular pedir.'
    ],
    aba: 'diario'
  },
  {
    id: 'rota-ida',
    titulo: 'Durante a rota',
    texto: 'Toque em Iniciar rota. O cartão grande mostra a próxima parada.',
    itens: [
      'Embarcou: quando o aluno entrar na van. Ausente: quando não for. Ligar: fala com o responsável.',
      'Marcou sem querer? Toque em Desfazer na faixa que aparece por 8 segundos, ou toque de novo no botão.',
      'Quem está a bordo mostra o botão Entregue direto na linha.'
    ],
    aba: 'diario'
  },
  {
    id: 'volta',
    titulo: 'Na rota de Volta',
    texto: 'A ordem muda um pouco na volta.',
    itens: [
      'Primeiro marque "Embarcou" na escola, para cada aluno que subiu.',
      'Depois, em cada casa, toque em "Entregue" na linha do aluno.',
      'Ao terminar, toque em Encerrar rota.'
    ],
    aba: 'diario'
  },
  {
    id: 'mensagens',
    titulo: 'Mensagens',
    texto: 'A aba Mensagens é o canal com as famílias.',
    itens: ['Converse com uma família ou envie um "Aviso para toda a van".', 'O número vermelho ou azul no menu mostra o que ainda não foi lido.'],
    aba: 'mensagens'
  },
  {
    id: 'dinheiro',
    titulo: 'Gestão: mensalidades e financeiro',
    texto: 'Ficam em Mais > Gestão, a área de controle do seu negócio.',
    itens: [
      'Mensalidades: quem pagou e quem está em aberto. Você dá baixa no pagamento à mão.',
      'Financeiro: receitas, custos e resultado do mês.',
      'No posto, use Mais > Lançar abastecimento para registrar rápido.'
    ],
    aba: 'mais'
  },
  {
    id: 'privacidade',
    titulo: 'Privacidade e segurança',
    texto: 'Dados de crianças pedem cuidado.',
    itens: [
      'O responsável nunca recebe mapa, GPS nem coordenadas. Vê só a barra e o tempo estimado.',
      'Nenhum endereço de criança sai do app. Só você marca o ponto de embarque e o local da escola.',
      'Não compartilhe sua conta nem seu código de motorista.'
    ],
    aba: 'ajustes'
  },
  {
    id: 'fim',
    titulo: 'Pronto!',
    texto: 'Agora é com você. Comece cadastrando um aluno de verdade.',
    itens: ['Para rever este guia: Mais > Guia passo a passo.'],
    aba: 'diario'
  }
];

export const PASSOS_RESPONSAVEL: PassoGuia[] = [
  {
    id: 'boas-vindas',
    titulo: 'Bem-vindo ao VanEscolar',
    texto: 'Aqui você acompanha a van do seu filho(a) com segurança. Este guia leva 2 minutos.',
    itens: [
      'Você vê quando a van sai, quando seu filho embarca e quando chega à escola.',
      'Por segurança, o app não mostra mapa nem a posição da van: só uma barra e o tempo estimado.'
    ]
  },
  {
    id: 'comecar',
    titulo: 'Como começar',
    texto: 'Há dois caminhos, conforme o que o motorista passou.',
    itens: [
      'Recebeu uma mensagem com um código VAN-…? Digite no campo "Tenho um código do motorista".',
      'Recebeu o código do motorista (MOT-…)? Cadastre o filho(a) no formulário abaixo e o motorista confirma o lugar na van.'
    ],
    acao: 'exemplos'
  },
  {
    id: 'aguardando',
    titulo: 'Aguardando o motorista',
    texto: 'Depois de cadastrar o filho(a), aparece um ponto amarelo ao lado do nome.',
    itens: ['Significa que o motorista ainda vai confirmar o lugar na van.', 'Quando ele confirmar, o acompanhamento começa.']
  },
  {
    id: 'acompanhar',
    titulo: 'Acompanhar a van',
    texto: 'Na tela principal você vê a situação de hoje.',
    itens: [
      'O cartão no topo diz se a van aguarda partida, está a caminho, se seu filho está a bordo ou foi entregue.',
      'A barra de proximidade mostra o quanto falta, sem mapa.',
      'Você pode escolher como quer ser avisado quando a van estiver chegando.'
    ]
  },
  {
    id: 'ausencia',
    titulo: 'Avisar uma ausência',
    texto: 'Seu filho não vai hoje? Toque em "Avisar Ausência", no topo.',
    itens: [
      'Escolha o motivo e o trecho: só ida, só volta ou os dois.',
      'Mudou de ideia? Toque em "Desfazer Ausência".'
    ]
  },
  {
    id: 'horarios',
    titulo: 'Horários e mensagens',
    texto: 'Os horários de entrada e saída da escola são definidos pelo motorista.',
    itens: ['Você vê os horários, mas não altera.', 'Converse com o motorista pelas mensagens do app.', 'Mais de um filho? Use "+ Filho" para cadastrar o próximo.']
  },
  {
    id: 'privacidade',
    titulo: 'Sua privacidade',
    texto: 'Os dados do seu filho são usados só para o transporte.',
    itens: ['Nenhum endereço de criança aparece para outras famílias.', 'Só o motorista marca o ponto de embarque. Você não precisa marcar nada em mapa.'],
  },
  {
    id: 'fim',
    titulo: 'Pronto!',
    texto: 'Já pode usar o app. Para rever este guia, toque em "Guia passo a passo" no fim da tela.',
    itens: []
  }
];

export const passosDoPapel = (papel: PapelGuia): PassoGuia[] => (papel === 'motorista' ? PASSOS_MOTORISTA : PASSOS_RESPONSAVEL);
