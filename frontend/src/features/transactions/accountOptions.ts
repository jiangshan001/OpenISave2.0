import type { TransactionEntryOptions } from '@/api/transactions';
import type { Account } from '@/types';

/** Currency groups and their accounts use the backend's independent type ranking. */
export function buildAccountOptions(accounts: Account[], ranking?: TransactionEntryOptions) {
  const active = accounts.filter((account) => account.is_active && !account.is_archived);
  const byId = new Map(active.map((account) => [account.id, account]));
  const currencies = new Set([
    ...(ranking?.currencies.map((group) => group.currency) ?? []),
    ...active.map((account) => account.currency),
  ]);
  return [...currencies].flatMap((currency) => {
    const rankedIds = ranking?.currencies.find((group) => group.currency === currency)
      ?.accounts.map((account) => account.account_id) ?? [];
    const ids = new Set([...rankedIds, ...active.filter((a) => a.currency === currency).map((a) => a.id)]);
    const options = [...ids].flatMap((id) => {
      const account = byId.get(id);
      return account?.currency === currency
        ? [{ value: account.id, label: `${account.name} · ${account.currency}` }]
        : [];
    });
    return options.length ? [{ label: currency, options }] : [];
  });
}
