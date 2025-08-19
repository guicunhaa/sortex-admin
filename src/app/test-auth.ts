import { auth } from '../lib/firebaseAdmin.js'

async function main() {
  try {
    const user = await auth.getUserByEmail('admin@sortex.com')
    console.log('Usuário encontrado:', user.uid)
  } catch (error) {
    console.error('Erro ao buscar usuário:', error)
  }
}

main()
