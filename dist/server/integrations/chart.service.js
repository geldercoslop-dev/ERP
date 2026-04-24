/**
 * Integração QuickChart — geração de gráficos via URL (gratuito, sem chave).
 * https://quickchart.io/
 */
const BASE = "https://quickchart.io/chart";
/**
 * Gera URL de gráfico de barras de vendas (últimos dias ou por período).
 * O front pode exibir: <img src={url} alt="Gráfico vendas" />
 */
export function gerarGraficoVendasUrl(series, titulo = "Vendas") {
    const labels = series.map((s) => s.label);
    const data = series.map((s) => s.valor);
    const config = {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "Valor (R$)",
                    data,
                    backgroundColor: "rgba(59, 130, 246, 0.6)",
                    borderColor: "rgb(59, 130, 246)",
                    borderWidth: 1,
                },
            ],
        },
        options: {
            title: { display: true, text: titulo },
            scales: {
                yAxes: [{ ticks: { beginAtZero: true } }],
            },
            legend: { display: false },
        },
    };
    return `${BASE}?c=${encodeURIComponent(JSON.stringify(config))}&width=500&height=300`;
}
/**
 * Gera URL de gráfico de linha (ex.: vendas ao longo dos dias).
 */
export function gerarGraficoLinhaUrl(labels, valores, titulo = "Vendas") {
    const config = {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Valor",
                    data: valores,
                    fill: false,
                    borderColor: "rgb(75, 192, 192)",
                    tension: 0.1,
                },
            ],
        },
        options: {
            title: { display: true, text: titulo },
            scales: { yAxes: [{ ticks: { beginAtZero: true } }] },
        },
    };
    return `${BASE}?c=${encodeURIComponent(JSON.stringify(config))}&width=500&height=300`;
}
