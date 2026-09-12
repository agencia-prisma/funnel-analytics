'use client';

import { useMemo, useState } from 'react';

type FaqItem = {
  category: string;
  question: string;
  answer: string;
  steps?: string[];
  note?: string;
};

const FAQ: FaqItem[] = [
  {
    category: 'Primeiros passos',
    question: 'O que é um Workspace?',
    answer:
      'O Workspace é o ambiente da sua empresa dentro do Funnel Analytics. Pixels, funis, membros, permissões, moeda e timezone ficam vinculados ao Workspace ativo.',
  },
  {
    category: 'Primeiros passos',
    question: 'Como trocar de Workspace?',
    answer:
      'Use o seletor de Workspace no topo da aplicação. Ao trocar, o sistema passa a exibir apenas os dados e configurações daquele ambiente.',
  },
  {
    category: 'Primeiros passos',
    question: 'Por que algumas opções não aparecem para mim?',
    answer:
      'As telas e ações respeitam a sua função no Workspace. Owner e Admin possuem mais permissões de gestão; Analyst e Viewer têm acesso principalmente de leitura.',
  },
  {
    category: 'Primeiros passos',
    question: 'O que significam timezone e moeda do Workspace?',
    answer:
      'O timezone define a referência de horário usada pelo Workspace e a moeda define a moeda principal da operação. Essas configurações ajudam a manter relatórios e análises consistentes.',
  },
  {
    category: 'Pixels e rastreamento',
    question: 'O que é um Pixel?',
    answer:
      'O Pixel é o identificador de rastreamento usado para conectar seu site ou páginas ao Funnel Analytics. Cada Pixel possui uma public key própria e pode ter um ou mais domínios autorizados.',
  },
  {
    category: 'Pixels e rastreamento',
    question: 'Como criar um Pixel?',
    answer: 'Abra Pixels e clique em Criar Pixel.',
    steps: [
      'Informe um nome fácil de identificar, como “Site principal”.',
      'Se quiser, informe um domínio inicial.',
      'Conclua a criação para receber a public key e o código de instalação.',
    ],
  },
  {
    category: 'Pixels e rastreamento',
    question: 'O que é a Public Key?',
    answer:
      'É o identificador público do Pixel. Ela informa ao sistema para qual Pixel os eventos devem ser enviados. A public key pode ser copiada diretamente na tela do Pixel.',
  },
  {
    category: 'Pixels e rastreamento',
    question: 'Como instalar o Pixel no meu site?',
    answer:
      'Abra o Pixel e copie o código exibido na seção Instalação. Esse snippet deve ser adicionado às páginas que serão rastreadas.',
  },
  {
    category: 'Pixels e rastreamento',
    question: 'O que são domínios autorizados?',
    answer:
      'São os domínios que podem enviar eventos para aquele Pixel. Eles funcionam como uma camada de controle para evitar que o Pixel seja utilizado em origens que não pertencem à sua operação.',
  },
  {
    category: 'Pixels e rastreamento',
    question: 'Posso usar subdomínios?',
    answer:
      'Sim. Quando aplicável, você pode cadastrar um domínio específico ou um padrão com wildcard, por exemplo *.exemplo.com, para representar subdomínios.',
  },
  {
    category: 'Pixels e rastreamento',
    question: 'O que significa Health do Pixel?',
    answer:
      'Health é um indicador do estado de rastreamento do Pixel. Ele usa sinais como recebimento recente de eventos para ajudar você a identificar se o Pixel está ativo e sendo utilizado.',
  },
  {
    category: 'Pixels e rastreamento',
    question: 'O que é “Último evento”?',
    answer:
      'É a data e hora do evento mais recente reconhecido pelo sistema para aquele Pixel. Se nenhum evento tiver sido recebido, a interface informa isso.',
  },
  {
    category: 'Pixels e rastreamento',
    question: 'Qual a diferença entre pausar e arquivar um Pixel?',
    answer:
      'Pausar é uma ação reversível: o Pixel pode ser reativado depois. Arquivar é usado para encerrar o uso daquele registro, mantendo o histórico preservado.',
  },
  {
    category: 'Funnels',
    question: 'O que é um Funnel?',
    answer:
      'Um Funnel representa uma sequência de etapas que você deseja acompanhar, como visita à página, lead, checkout e compra. Cada etapa possui uma regra que define quando ela foi atingida.',
  },
  {
    category: 'Funnels',
    question: 'Como criar um novo Funnel?',
    answer:
      'Abra Funnels e selecione Novo Funnel. O Builder inicia com uma sequência base e você pode editar o nome, as etapas, as regras e a janela de conversão antes de publicar.',
  },
  {
    category: 'Funnels',
    question: 'O que são etapas do funil?',
    answer:
      'Etapas são os marcos que compõem a jornada. Exemplos: Landing Page, Lead, Início de Checkout e Compra. A ordem das etapas define a sequência analítica do funil.',
  },
  {
    category: 'Funnels',
    question: 'Como adicionar, duplicar, mover ou remover uma etapa?',
    answer:
      'Use a lista de etapas ou abra a configuração de uma etapa. Você pode adicionar novas etapas, duplicar uma etapa existente, mover para a esquerda ou direita e remover quando necessário.',
  },
  {
    category: 'Funnels',
    question: 'O que significa “Quando a pessoa...” na configuração da etapa?',
    answer:
      'É o modo simples de definir o evento principal da etapa. Você escolhe uma ação em linguagem comum, como visualizar uma página, enviar um formulário, iniciar o checkout ou realizar uma compra.',
  },
  {
    category: 'Funnels',
    question: 'Como restringir uma etapa a uma página ou campanha específica?',
    answer:
      'Use Adicionar condição. Você pode restringir por URL da página, origem da campanha, nome da campanha, site de origem, dispositivo e outras condições disponíveis.',
  },
  {
    category: 'Funnels',
    question: 'Quando devo usar o Modo avançado?',
    answer:
      'Use o Modo avançado quando precisar de regras mais específicas, grupos ALL ou ANY, exceções com NOT, propriedades customizadas ou operadores técnicos. O modo simples é recomendado para a maioria dos casos.',
  },
  {
    category: 'Funnels',
    question: 'O que significam ALL, ANY e NOT?',
    answer:
      'ALL exige que todas as condições do grupo sejam verdadeiras. ANY considera a regra atendida quando qualquer condição for verdadeira. NOT inverte uma regra e serve para criar exceções.',
  },
  {
    category: 'Funnels',
    question: 'O que é a janela de conversão?',
    answer:
      'É o intervalo máximo usado para considerar os eventos como parte da mesma jornada de conversão do funil. Ela pode ser configurada nas configurações gerais do Funnel.',
  },
  {
    category: 'Funnels',
    question: 'O que é Salvar rascunho?',
    answer:
      'Salvar rascunho mantém as alterações do Builder sem publicar uma nova versão. O rascunho atual é salvo no navegador usado durante a edição.',
    note:
      'Como o rascunho é local ao navegador, ele não deve ser tratado como uma versão publicada nem como um backup compartilhado entre dispositivos.',
  },
  {
    category: 'Funnels',
    question: 'O que acontece quando eu publico um Funnel?',
    answer:
      'A publicação cria uma versão imutável do Funnel. Se for a primeira publicação, será criada a versão 1. Alterações futuras geram versões seguintes, como v2, v3 e assim por diante.',
  },
  {
    category: 'Funnels',
    question: 'Por que versões publicadas são imutáveis?',
    answer:
      'Isso protege a consistência histórica. Uma versão usada para analisar dados não é alterada retroativamente. Quando você muda o Funnel, o sistema cria uma nova versão em vez de editar a anterior.',
  },
  {
    category: 'Funnels',
    question: 'O que acontece se duas pessoas editarem o mesmo Funnel?',
    answer:
      'O sistema verifica a versão atual antes de publicar. Se outra pessoa tiver publicado uma versão mais recente, a sua publicação pode ser bloqueada para evitar sobrescrever alterações sem perceber.',
  },
  {
    category: 'Funnels',
    question: 'Para que servem Desfazer e Refazer?',
    answer:
      'Esses controles permitem voltar ou reaplicar alterações feitas durante a sessão de edição do Builder, antes da publicação.',
  },
  {
    category: 'Funnels',
    question: 'O que acontece ao arquivar um Funnel?',
    answer:
      'O Funnel fica preservado para consulta, mas deixa de aceitar novas alterações e versões pela interface normal de edição.',
  },
  {
    category: 'Membros e permissões',
    question: 'Quais funções existem no Workspace?',
    answer:
      'Existem quatro funções: Owner, Admin, Analyst e Viewer. Elas determinam o nível de acesso às configurações, membros, Pixels e Funnels.',
  },
  {
    category: 'Membros e permissões',
    question: 'O que o Owner pode fazer?',
    answer:
      'O Owner possui o nível mais alto de acesso do Workspace, incluindo configurações, membros, Pixels, domínios e Funnels.',
  },
  {
    category: 'Membros e permissões',
    question: 'O que o Admin pode fazer?',
    answer:
      'O Admin pode administrar grande parte do Workspace, incluindo configurações, Pixels, domínios, Funnels e membros abaixo do nível de Owner. O Admin não pode convidar outro Owner.',
  },
  {
    category: 'Membros e permissões',
    question: 'O que Analyst e Viewer podem fazer?',
    answer:
      'Eles possuem acesso principalmente de consulta. Podem visualizar Pixels, domínios e Funnels, mas não possuem as mesmas permissões de gestão e publicação de Owner ou Admin.',
  },
  {
    category: 'Membros e permissões',
    question: 'Como convidar um novo membro?',
    answer:
      'Abra Configurações > Membros. Se sua função permitir, informe o e-mail e escolha uma função disponível. O convite fica listado até ser aceito, expirado ou revogado.',
  },
  {
    category: 'Membros e permissões',
    question: 'Posso alterar a função de um membro?',
    answer:
      'Sim, quando sua própria função possuir permissão para gerenciar aquela pessoa. O Owner possui maior alcance; Admins podem gerenciar principalmente Analyst e Viewer.',
  },
  {
    category: 'Membros e permissões',
    question: 'Posso revogar um convite?',
    answer:
      'Sim. Convites pendentes podem ser revogados na página de Membros quando você possui permissão de convite.',
  },
  {
    category: 'Configurações',
    question: 'Como alterar o nome do Workspace?',
    answer:
      'Abra Configurações e acesse Workspace. Usuários com permissão de atualização podem alterar o nome, timezone e moeda.',
  },
  {
    category: 'Configurações',
    question: 'Posso alterar o slug do Workspace?',
    answer:
      'Na interface atual, o slug é exibido apenas para consulta e não pode ser editado diretamente pela página de configurações.',
  },
  {
    category: 'Segurança e dados',
    question: 'Um usuário de outro Workspace consegue ver meus dados?',
    answer:
      'Não deve. Pixels, domínios, Funnels e demais recursos são consultados e alterados dentro do Workspace ativo, com regras de autorização e isolamento entre ambientes.',
  },
  {
    category: 'Segurança e dados',
    question: 'A permissão da interface é a única proteção?',
    answer:
      'Não. As ações sensíveis também passam por validações de permissão no servidor e pelas políticas de acesso do banco de dados. Esconder um botão na interface não é usado como única camada de segurança.',
  },
  {
    category: 'Segurança e dados',
    question: 'Arquivar apaga meu histórico?',
    answer:
      'Não. O objetivo do arquivamento é interromper o uso normal daquele recurso preservando o registro e o histórico já existente.',
  },
  {
    category: 'Solução de problemas',
    question: 'Criei um Pixel, mas nenhum evento aparece. O que devo conferir?',
    answer:
      'Confirme se o código de instalação está na página correta, se a public key pertence ao Pixel certo e se o domínio utilizado está autorizado. Depois verifique novamente o último evento e o Health.',
  },
  {
    category: 'Solução de problemas',
    question: 'Não consigo editar ou publicar um Funnel. O que pode ser?',
    answer:
      'As causas mais comuns são falta de permissão, Funnel arquivado, regra inválida ou conflito de versão porque outra pessoa publicou uma versão mais recente.',
  },
  {
    category: 'Solução de problemas',
    question: 'Meu rascunho não apareceu em outro computador. Isso é esperado?',
    answer:
      'Sim. O rascunho do Builder é salvo localmente no navegador. Para compartilhar uma configuração estável entre usuários e dispositivos, publique uma versão do Funnel.',
  },
  {
    category: 'Solução de problemas',
    question: 'O que fazer se uma regra ficou complexa demais no modo simples?',
    answer:
      'Abra o Modo avançado. O sistema preserva a estrutura existente e permite editar condições, grupos e operadores que não cabem na experiência simplificada.',
  },
];

const categories = ['Todas', ...Array.from(new Set(FAQ.map((item) => item.category)))];

export function FaqGuide() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return FAQ.filter((item) => {
      const matchesCategory = category === 'Todas' || item.category === category;
      const matchesQuery =
        !normalized ||
        `${item.question} ${item.answer} ${item.steps?.join(' ') ?? ''}`
          .toLocaleLowerCase('pt-BR')
          .includes(normalized);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-2 rounded-2xl border border-white/10 bg-[#0b0911]/95 p-4 shadow-xl backdrop-blur">
        <label className="block text-sm font-medium text-zinc-200">
          Buscar uma dúvida
          <input
            aria-label="Buscar nas dúvidas frequentes"
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: publicar funil, instalar pixel, convidar membro..."
            type="search"
            value={query}
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                category === item
                  ? 'border-violet-400/40 bg-violet-400/15 text-violet-200'
                  : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-white'
              }`}
              key={item}
              onClick={() => setCategory(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-3">
        {filtered.length ? (
          filtered.map((item, index) => (
            <details
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 open:border-violet-400/20 open:bg-violet-400/[0.04]"
              key={`${item.category}-${index}`}
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium text-white">
                <span>
                  <span className="mb-2 block text-[11px] font-semibold tracking-[0.14em] text-violet-300 uppercase">
                    {item.category}
                  </span>
                  {item.question}
                </span>
                <span className="mt-1 text-lg text-zinc-500 transition group-open:rotate-45">+</span>
              </summary>
              <div className="mt-4 border-t border-white/10 pt-4 text-sm leading-7 text-zinc-400">
                <p>{item.answer}</p>
                {item.steps?.length ? (
                  <ol className="mt-3 grid gap-2 pl-5 text-zinc-300">
                    {item.steps.map((step, stepIndex) => (
                      <li className="list-decimal" key={step}>
                        {step}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {item.note ? (
                  <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs leading-6 text-amber-100">
                    {item.note}
                  </p>
                ) : null}
              </div>
            </details>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <p className="font-medium text-white">Nenhuma resposta encontrada.</p>
            <p className="mt-2 text-sm text-zinc-500">
              Tente buscar por outro termo ou selecione “Todas”.
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-2xl border border-violet-400/20 bg-violet-400/[0.05] p-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-violet-300 uppercase">
          Não encontrou sua dúvida?
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">
          Use este FAQ como guia operacional do sistema.
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          O conteúdo será atualizado conforme novas funcionalidades forem liberadas, para manter as orientações alinhadas ao que o usuário realmente encontra na plataforma.
        </p>
      </div>
    </div>
  );
}
