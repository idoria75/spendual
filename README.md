# spendual

Household finance app for two people: shared budgets, personal allowances, recurring bills and
installments. Runs on your LAN. Stack: Express, TypeScript, Prisma, MySQL, React.

Dev runs inside Docker only. You do not need Node on your machine.

```
make install   # install dependencies
make dev       # start dev servers
make test      # run tests
```

Copy `.env.example` to `.env` and set `SESSION_SECRET`.

## License

AGPL-3.0. See `LICENSE`.
