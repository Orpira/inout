<form id="offline-form">
    <button type="submit">Registro Offline</button>
</form>

<script>
    // JavaScript para enviar datos al servidor, incluso sin conexión
    // Utilizar local storage o una base de datos local
    // JavaScript (Vue.js, por ejemplo)
    export default {
        methods: {
            registrar() {
                // Enviar datos al servidor (si hay conexión)
                axios.post('/registros', this.formData)
                    .then(response => {
                        // Manejar respuesta exitosa
                    })
                    .catch(error => {
                        // Almacenar en localStorage
                        localStorage.setItem('registrosPendientes', JSON.stringify([...this.registrosPendientes, this.formData]))
                    })
            },
            sincronizar() {
                // Obtener registros pendientes de localStorage
                const registrosPendientes = JSON.parse(localStorage.getItem('registrosPendientes')) || [];

                // Enviar registros al servidor usando Laravel Queue
                registrosPendientes.forEach(registro => {
                    axios.post('/registros', registro)
                        .then(() => {
                            // Eliminar registro de localStorage
                        })
                        .catch(error => {
                            // Manejar errores
                        });
                });
            }
        }
    }
</script>