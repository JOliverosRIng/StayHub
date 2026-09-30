#!/usr/bin/env bash
# Desde la raíz: nohup bash integracion.sh > integracion.log 2>&1 < /dev/null &
# Cada invocación abre sesiones nuevas; las tareas completas se omiten al reanudar.
set -euo pipefail

integration_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$integration_root"

# ID confirmado mediante `opencode models deepseek --verbose`:
# name: DeepSeek V4.1 Flash, id: deepseek-flash.
integration_model='deepseek/deepseek-flash'
integration_index='agents/integracion/PLAN.md'
integration_logs='.artifacts/integracion'

for dependency in opencode flock awk tee; do
    command -v "$dependency" >/dev/null || {
        printf 'Falta el comando requerido: %s\n' "$dependency" >&2
        exit 1
    }
done

mkdir -p -- "$integration_logs"
exec 9> "$integration_logs/runner.lock"
flock -n 9 || {
    printf 'Ya hay una ejecución de integracion.sh en curso.\n' >&2
    exit 1
}

[[ -s "$integration_index" && -s agents/integracion/CONTEXTO.md ]] || {
    printf 'Falta el índice o CONTEXTO.md.\n' >&2
    exit 1
}

task_complete() {
    local number="$1" result="agents/integracion/task-$1/resultado.md"
    [[ -s "$result" ]] || return 1
    # Exigir coincidencia exacta: INCOMPLETA nunca cuenta como COMPLETA.
    awk -F '|' -v number="$number" '
        { gsub(/[[:space:]*]/, "", $2); gsub(/[[:space:]*]/, "", $6) }
        $2 == number && $6 == "COMPLETA" { found = 1 }
        END { exit !found }
    ' "$integration_index" || return 1
    awk '
        { gsub(/\*/, ""); sub(/^[[:space:]]+/, ""); sub(/[[:space:]]+$/, "") }
        /^Estado:[[:space:]]*COMPLETA$/ { found = 1 }
        END { exit !found }
    ' "$result"
}

printf 'Integración con DeepSeek V4.1 Flash (%s)\n' "$integration_model"
for number in 01 02 03 04 05 06 07 08; do
    task="agents/integracion/task-$number/PLAN.md"
    [[ -s "$task" ]] || {
        printf 'Falta el plan: %s\n' "$task" >&2
        exit 1
    }
    if task_complete "$number"; then
        printf 'task-%s: ya completa, se omite.\n' "$number"
        continue
    fi

    task_log="$integration_logs/task-$number-$(date +%Y%m%d-%H%M%S)-$$.log"
    printf '\nEjecutando task-%s. Log: %s\n' "$number" "$task_log"
    prompt="Lee agents/integracion/CONTEXTO.md, el índice agents/integracion/PLAN.md
y el plan $task. Lee los resultados anteriores y verifica las dependencias.
Ejecuta únicamente task-$number, incluyendo sus cambios y validaciones.
No ejecutes otras tareas ni delegues en otros agentes. Conserva trabajo y datos
existentes. No hagas commits ni push. Gateway está fuera de alcance.
Al terminar, escribe agents/integracion/task-$number/resultado.md con evidencia
real y una línea exacta Estado: COMPLETA solo si todos los criterios se cumplen.
Si faltan permisos, dependencias o pruebas, registra Estado: BLOQUEADA y explica
qué falta. No omitas comprobaciones ni inventes resultados para completar la tarea.
Actualiza únicamente su estado en la tabla del índice. Termina esta sesión después
de entregar el resultado; el lanzador decidirá si puede iniciar la siguiente."

    if opencode run --agent build --model "$integration_model" \
        --dir "$integration_root" --title "Integración task-$number" \
        "$prompt" 2>&1 | tee "$task_log"; then
        if ! task_complete "$number"; then
            printf 'Detenido: task-%s no acredita COMPLETA en resultado e índice. Revisa %s\n' \
                "$number" "$task_log" >&2
            exit 1
        fi
    else
        printf 'OpenCode falló en task-%s. Revisa %s\n' "$number" "$task_log" >&2
        exit 1
    fi
    printf 'task-%s: completa según resultado e índice.\n' "$number"
done

printf '\nLas ocho tareas están registradas como completas. Revisa agents/integracion/resultado.md\n'
