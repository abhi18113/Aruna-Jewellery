import { supabase } from './supabase'

async function testConnection() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')

  if (error) {
    console.error('Supabase error:', error.message)
    return
  }

  console.log('Supabase connection successful!')
  console.log('Categories:', data)
}

testConnection()