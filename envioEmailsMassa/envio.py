#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import smtplib
import json  # ← ADICIONADO
from email.message import EmailMessage
from typing import List
import time

# ---------- CONFIGURAÇÕS ----------

# config das contas 

# 000devHome@gmail.com  -  jmqg fvep cjnm oluy
# desenvolvasoftwares@gmail.com  -  irak wyqd plnk wkcf

#==================

REMETENTE     = ""
SENHA         = ""
SERVIDOR_SMTP = "smtp.gmail.com"
PORTA_SMTP    = 587
ASSUNTO       = "Viabilidade Técnica"
CORPO_HTML    = """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Dúvida rápida</title>
</head>

<body style="font-family: Arial, sans-serif; background:#f5f7fa; padding:20px;">

  <div style="max-width:520px; margin:auto; background:#ffffff; padding:30px; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.06);">

    <h2 style="color:#1f2937; margin-top:0;">
      Dúvida rápida sobre avaliações no Google
    </h2>

    <p style="color:#374151; font-size:15px; line-height:1.6;">
      Olá, tudo bem?
    </p>

    <p style="color:#374151; font-size:15px; line-height:1.6;">
      Estou conversando com algumas clínicas de estética para entender uma coisa:
      <strong>quando surge uma avaliação negativa no Google, vocês conseguem responder rápido ou às vezes passa despercebido?</strong>
    </p>

    <p style="color:#374151; font-size:15px; line-height:1.6;">
      Estou estudando criar uma ferramenta simples apenas para avisar e ajudar na resposta.
      Queria saber se isso teria utilidade para vocês.
    </p>

    <a href="mailto:seuemail@dominio.com?subject=Resposta rápida&body=Olá! Hoje nós ________ avaliações negativas."
       style="display:block; text-align:center; background:#2563eb; color:#ffffff; text-decoration:none; padding:14px; border-radius:8px; font-weight:bold; margin-top:25px;">
       Responder rápido
    </a>

    <p style="font-size:12px; color:#9ca3af; text-align:center; margin-top:25px;">
      Pesquisa rápida de mercado • resposta leva menos de 30 segundos
    </p>

  </div>

</body>
</html>

"""  # (seu HTML continua igual)
ARQ_LISTA     = "emails.txt"
DELAY_SEG     = 120
ARQ_PROGRESSO = "progresso.json"  # ← ADICIONADO
LIMITE_POR_EXEC = 30              # ← ADICIONADO
# -----------------------------------

ordemEmail = 0

if (ordemEmail == 0):
  REMETENTE     = "000devHome@gmail.com"
  SENHA         = "jmqg fvep cjnm oluy"
else:
  REMETENTE     = "desenvolvasoftwares@gmail.com"
  SENHA         = "irak wyqd plnk wkcf"


def ler_lista(caminho: str) -> List[str]:
    with open(caminho, encoding="utf-8") as f:
        return [lin.strip() for lin in f if lin.strip() and "@" in lin]

def carregar_progresso() -> int:
    try:
        with open(ARQ_PROGRESSO, "r", encoding="utf-8") as f:
            return json.load(f).get("index", 0)
    except (FileNotFoundError, json.JSONDecodeError):
        return 0

def salvar_progresso(index: int):
    with open(ARQ_PROGRESSO, "w", encoding="utf-8") as f:
        json.dump({"index": index}, f)

def enviar_para(dest: str, remetente: str, senha: str,
                servidor: str, porta: int, assunto: str, html: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = remetente
    msg["To"] = dest
    msg.set_content("Seu cliente de e-mail não suporta HTML.")
    msg.add_alternative(html, subtype="html")

    with smtplib.SMTP(servidor, porta) as smtp:
        smtp.starttls()
        smtp.login(remetente, senha)
        smtp.send_message(msg)
    print(f"[✓] Enviado para {dest}")

def main():
    emails = ler_lista(ARQ_LISTA)
    total = len(emails)
    print(f"Total de destinatários: {total}\n")

    indice_atual = carregar_progresso()
    enviados = 0

    while enviados < LIMITE_POR_EXEC and indice_atual < total:
        dest = emails[indice_atual]
        try:
            enviar_para(dest, REMETENTE, SENHA, SERVIDOR_SMTP, PORTA_SMTP,
                        ASSUNTO, CORPO_HTML)
            time.sleep(DELAY_SEG)
            enviados += 1
            indice_atual += 1
        except Exception as exc:
            print(f"[ERRO] {dest} -> {exc}")
            indice_atual += 1

    salvar_progresso(indice_atual % total)
    print(f"\n[✓] Envios realizados: {enviados}")
    print(f"[→] Próximo índice: {indice_atual % total}")

if __name__ == "__main__":
    main()